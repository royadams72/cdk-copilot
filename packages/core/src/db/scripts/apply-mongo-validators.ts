// scripts/apply-mongo-validators.ts
import { MongoClient, Document } from "mongodb";
import fs from "fs";
import path from "path";

type CollModLike = {
  collMod?: string;
  create?: string;
  validator?: Document;
  validationLevel?: "off" | "moderate" | "strict";
  validationAction?: "error" | "warn";
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
  return { name, validator, validationLevel, validationAction };
}

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  const DB_NAME = process.env.DB_NAME;
  const DIR = process.argv[2] || "mongo-validators";

  if (!MONGODB_URI || !DB_NAME) {
    console.error("Missing MONGODB_URI or DB_NAME env vars.");
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

  console.log(`Applying validators from ${files.length} files in ${DIR}...\n`);

  for (const file of files) {
    const full = path.join(folder, file);
    let cmdRaw: unknown;
    try {
      const text = fs.readFileSync(full, "utf8");
      cmdRaw = JSON.parse(text);
    } catch (e) {
      console.error(`✗ ${file}  — JSON parse error:`, (e as Error).message);
      continue;
    }

    if (!isObject(cmdRaw)) {
      console.error(`✗ ${file}  — JSON root must be an object`);
      continue;
    }

    // Supports either a collMod command (as provided earlier) or a create command JSON
    try {
      if ("collMod" in cmdRaw) {
        const cm = cmdRaw as CollModLike;
        const { name, validator, validationLevel, validationAction } =
          extractSchemaFromCollMod(cm);

        try {
          await db.command({
            collMod: name,
            validator,
            validationLevel,
            validationAction,
          });
          console.log(`✓ ${file}  — collMod applied to "${name}"`);
        } catch (err: any) {
          // If collection missing, fallback to create
          const msg = String(err?.message ?? "");
          const code = err?.code ?? err?.codeName ?? "";
          const missing =
            msg.includes("NamespaceNotFound") ||
            code === 26 || // NamespaceNotFound
            msg.includes("cannot find") ||
            msg.includes("does not exist");

          if (!missing) throw err;

          await db.command({
            create: name,
            validator,
            validationLevel,
            validationAction,
          });
          console.log(
            `• ${file}  — collection "${name}" created with validator (was missing)`
          );
        }
      } else if ("create" in cmdRaw) {
        // If user provided a create command JSON directly
        await db.command(cmdRaw as Document);
        console.log(`✓ ${file}  — create command executed`);
      } else {
        console.error(
          `✗ ${file}  — Unsupported JSON shape. Expect a { "collMod": "<name>", "validator": {...} } or { "create": "<name>", ... }`
        );
      }
    } catch (e) {
      console.error(`✗ ${file}  — Command failed:`, (e as Error).message);
    }
  }

  await client.close();
  console.log("\nDone.");
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
