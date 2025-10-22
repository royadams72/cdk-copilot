// scripts/apply-mongo-validators.ts
import { MongoClient, Document, IndexDescription } from "mongodb";
import path from "path";
import fs from "fs";
import { config as dotenv } from "dotenv";

dotenv({ path: path.resolve(process.cwd(), ".env") });
dotenv({ path: path.resolve(process.cwd(), ".env.local") });

type CollModLike = {
  collMod?: string;
  create?: string;
  validator?: Document;
  validationLevel?: "off" | "moderate" | "strict";
  validationAction?: "error" | "warn";
  // NEW: optional indexes in the same JSON file
  indexes?: Array<{
    key: Record<string, 1 | -1>;
    options?: Omit<IndexDescription, "key">;
  }>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function extractSchemaFromCollMod(cmd: CollModLike) {
  const name = cmd.collMod;
  const validator = cmd.validator;
  const validationLevel = cmd.validationLevel ?? "moderate";
  const validationAction = cmd.validationAction ?? "error";
  if (!name || !validator)
    throw new Error("collMod JSON must include collMod and validator");
  return {
    name,
    validator,
    validationLevel,
    validationAction,
    indexes: cmd.indexes || [],
  };
}

async function ensureIndexes(
  coll: any,
  wanted: NonNullable<CollModLike["indexes"]>
) {
  if (!wanted.length) return;
  const existing = await coll.indexes(); // [{ name, key, ... }]
  const has = (key: Record<string, any>) =>
    existing.some((ix: any) => JSON.stringify(ix.key) === JSON.stringify(key));

  for (const ix of wanted) {
    if (!has(ix.key)) {
      await coll.createIndex(ix.key, ix.options || {});
      console.log(`  + index ${JSON.stringify(ix.key)} on ${coll.namespace}`);
    } else {
      console.log(
        `  ✓ index exists ${JSON.stringify(ix.key)} on ${coll.namespace}`
      );
    }
  }

  // NOTE: if you change options (e.g. add unique) later, Mongo won’t “alter” an index.
  // You must drop & recreate; handle that explicitly when needed.
}

async function run() {
  const MONGODB_URI =
    process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI;
  const DB_NAME = process.env.DB_NAME || process.env.MONGODB_DB;
  const DIR = process.argv[2] || "scripts/mongo-validators";

  if (!MONGODB_URI || !DB_NAME) {
    console.error(
      "Missing MONGODB_URI(_MIGRATIONS) or DB_NAME/MONGODB_DB env vars."
    );
    process.exit(1);
  }

  // Prod guard
  if (
    process.env.NODE_ENV === "production" &&
    process.env.APPLY_DB_SHAPE !== "true"
  ) {
    console.error(
      "Refusing to apply validators/indexes in production without APPLY_DB_SHAPE=true"
    );
    process.exit(1);
  }

  const folder = path.resolve(process.cwd(), DIR);
  if (!fs.existsSync(folder)) {
    console.error(`Directory not found: ${folder}`);
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const files = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .sort();
  console.log(
    `Applying validators/indexes from ${files.length} files in ${DIR}...\n`
  );

  for (const file of files) {
    const full = path.join(folder, file);
    let cmdRaw: unknown;

    try {
      const text = fs.readFileSync(full, "utf8");
      cmdRaw = JSON.parse(text);
    } catch (e) {
      console.error(`✗ ${file} — JSON parse error:`, (e as Error).message);
      continue;
    }
    if (!isObject(cmdRaw)) {
      console.error(`✗ ${file} — JSON root must be an object`);
      continue;
    }

    try {
      if ("collMod" in cmdRaw) {
        const cm = cmdRaw as CollModLike;
        const { name, validator, validationLevel, validationAction, indexes } =
          extractSchemaFromCollMod(cm);

        // Apply validator (collMod or create fallback)
        try {
          await db.command({
            collMod: name,
            validator,
            validationLevel,
            validationAction,
          });
          console.log(`✓ ${file} — collMod applied to "${name}"`);
        } catch (err: any) {
          const msg = String(err?.message ?? "");
          const missing =
            ["NamespaceNotFound", "cannot find", "does not exist"].some((s) =>
              msg.includes(s)
            ) || err?.code === 26;
          if (!missing) throw err;

          await db.command({
            create: name,
            validator,
            validationLevel,
            validationAction,
          });
          console.log(
            `• ${file} — collection "${name}" created with validator (was missing)`
          );
        }

        // Apply indexes if provided
        if (indexes?.length) {
          const coll = db.collection(name);
          await ensureIndexes(coll, indexes);
        }
      } else if ("create" in cmdRaw) {
        // Direct create command JSON
        const createCmd = cmdRaw as Document;
        await db.command(createCmd);
        console.log(`✓ ${file} — create command executed`);

        // If it also includes 'indexes' sibling key, try to infer collection name and apply
        const name = (createCmd as any).create as string;
        const indexes = (cmdRaw as any).indexes as CollModLike["indexes"];
        if (name && Array.isArray(indexes) && indexes.length) {
          await ensureIndexes(db.collection(name), indexes);
        }
      } else {
        console.error(
          `✗ ${file} — Unsupported JSON shape. Expect { "collMod": "<name>", "validator": {...}, "indexes":[...] }`
        );
      }
    } catch (e) {
      console.error(`✗ ${file} — Command failed:`, (e as Error).message);
    }
  }

  await client.close();
  console.log("\nDone.");
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
