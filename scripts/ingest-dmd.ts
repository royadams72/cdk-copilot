/**
 * dm+d (TRUD) ingestion → MongoDB `drugs_ref`
 *
 * What it does
 * - Reads a TRUD dm+d ZIP (NHSBSA dm+d weekly release)
 * - Extracts VMP and (optionally) AMP XML
 * - Streams each file (no huge in-memory parse)
 * - Maps fields → drugs_ref schema
 * - Bulk upserts by dmplusdCode in batches
 *
 * Usage
 *   pnpm add mongodb unzipper sax
 *  pnpm tsx scripts/ingest-dmd.ts \
  --zip data/nhsbsa_dmd.zip \
  --types VMP
 *
 * Env
 *   MONGODB_URI_APP=mongodb+srv://...
 *   MONGODB_DB=ckd_copilot
 *   (or DB_NAME=ckd_copilot)
 */

import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";

import { Collection, MongoClient } from "mongodb";
import unzipper from "unzipper";
import sax from "sax";
// 1) Load envs before importing anything that uses process.env
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type DmdType = "VMP" | "AMP" | "VMPP" | "AMPP";

type DrugsRefDoc = {
  atcCode?: string;
  displayName: string;
  dmdType: DmdType;
  dmplusdCode: string;
  form?: string;
  isActive: boolean;
  isBlacklisted?: boolean;
  name: string;
  nameNorm: string;
  parentDmplusdCode?: string;
  route?: string;
  snomedCode?: string;
  sourceVersion: string;
  strength?: string;
  synonyms: string[];
  synonymsNorm: string[];
  updatedAt: Date;
};

type CliArgs = {
  batchSize: number;
  dryRun: boolean;
  sourceVersion: string;
  types: Set<DmdType>;
  zip: string;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    batchSize: 2000,
    dryRun: false,
    sourceVersion: "",
    types: new Set<DmdType>(["VMP"]),
    zip: "",
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--zip") out.zip = argv[++i] ?? "";
    else if (a === "--types") {
      const raw = (argv[++i] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      out.types = new Set(raw as DmdType[]);
    } else if (a === "--sourceVersion") out.sourceVersion = argv[++i] ?? "";
    else if (a === "--dryRun") out.dryRun = true;
    else if (a === "--batchSize") out.batchSize = Number(argv[++i] ?? "2000");
  }

  if (!out.zip) throw new Error("Missing --zip <path-to-zip>");
  if (!out.sourceVersion) {
    // fallback: infer from filename
    out.sourceVersion = path.basename(out.zip).replace(/\.zip$/i, "");
  }
  return out;
}

/**
 * Normalise for autocomplete:
 * - lowercase
 * - convert punctuation to spaces
 * - collapse whitespace
 */
function normalizeTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "") // remove apostrophes
    .replace(/[^a-z0-9]+/g, " ") // non-alnum → space
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * TRUD dm+d XML file patterns commonly seen in NHSBSA dm+d zip:
 * - f_vmp2_*.xml
 * - f_amp2_*.xml
 *
 * We pick the first matching file for each type.
 */
function chooseXmlEntries(entries: unzipper.Entry[], wanted: Set<DmdType>) {
  const pick: Partial<Record<DmdType, unzipper.Entry>> = {};

  for (const e of entries) {
    const name = e.path.toLowerCase();
    if (!e.type || e.type !== "File") continue;

    if (
      wanted.has("VMP") &&
      !pick.VMP &&
      name.includes("vmp2") &&
      name.endsWith(".xml")
    )
      pick.VMP = e;
    if (
      wanted.has("AMP") &&
      !pick.AMP &&
      name.includes("amp2") &&
      name.endsWith(".xml")
    )
      pick.AMP = e;

    // If you later ingest VMPP/AMPP, add:
    // if (wanted.has("VMPP") && !pick.VMPP && name.includes("vmpp2") && name.endsWith(".xml")) pick.VMPP = e;
    // if (wanted.has("AMPP") && !pick.AMPP && name.includes("ampp2") && name.endsWith(".xml")) pick.AMPP = e;
  }

  const missing = [...wanted].filter((t) => !pick[t]);
  if (missing.length) {
    const available = entries
      .filter((e) => e.type === "File")
      .slice(0, 50)
      .map((e) => e.path)
      .join("\n  - ");
    throw new Error(
      `Could not find XML entries for: ${missing.join(", ")}\n` +
        `ZIP contains (first 50 files):\n  - ${available}`,
    );
  }

  return pick as Record<DmdType, unzipper.Entry>;
}

async function getMongoCollection(): Promise<{
  client: MongoClient;
  collection: Collection<DrugsRefDoc>;
}> {
  const uri = process.env.MONGODB_URI_APP;
  const dbName = process.env.MONGODB_DB || process.env.DB_NAME;
  if (!uri) throw new Error("Missing MONGODB_URI_APP env var");
  if (!dbName) throw new Error("Missing MONGODB_DB (or DB_NAME) env var");

  const client = new MongoClient(uri);
  await client.connect();
  return {
    client,
    collection: client.db(dbName).collection<DrugsRefDoc>("drugs_ref"),
  };
}

type RowBuilder = Partial<Record<string, string>> & { _tag?: string };

function createSaxRowIngestor(opts: {
  batchSize: number;
  collection: Collection<DrugsRefDoc>;
  dmdType: DmdType;
  dryRun: boolean;
  sourceVersion: string;
}) {
  const { dmdType, sourceVersion, collection, dryRun, batchSize } = opts;

  // dm+d tag mappings for minimal VMP/AMP:
  // VMP: often uses <VPID> (some variants may expose <VMPID>)
  // AMP: <AMP><AMPID>..</AMPID><NM>..</NM><INVALID>0/1</INVALID>...</AMP>
  const rootTag = dmdType; // "VMP" or "AMP"
  const idTagCandidates = dmdType === "VMP" ? ["VPID", "VMPID"] : ["AMPID"];

  // optional parent mapping (AMP → VMP) varies by schema; in many releases it’s <VPID> inside AMP
  const parentTagCandidates = dmdType === "AMP" ? ["VPID", "VMPID"] : [];

  let current: RowBuilder | null = null;
  let currentTextTag: string | null = null;
  let currentText = "";

  let pendingOps: any[] = [];
  let totalSeen = 0;
  let totalUpserts = 0;
  let flushChain: Promise<void> = Promise.resolve();
  let flushError: Error | null = null;

  async function flush() {
    if (!pendingOps.length) return;
    if (dryRun) {
      totalUpserts += pendingOps.length;
      pendingOps = [];
      return;
    }
    const res = await collection.bulkWrite(pendingOps, { ordered: false });
    totalUpserts +=
      (res.upsertedCount ?? 0) +
      (res.modifiedCount ?? 0) +
      (res.matchedCount ?? 0);
    pendingOps = [];
  }

  function toDoc(row: RowBuilder): DrugsRefDoc | null {
    const code = idTagCandidates
      .map((tag) => row[tag]?.trim())
      .find((value) => !!value);
    const name = row["NM"]?.trim();

    if (!code || !name) return null;

    const invalid = (row["INVALID"] ?? "").trim();
    const isActive = invalid === "0" || invalid === "" ? true : false;

    const parent =
      parentTagCandidates.map((t) => row[t]?.trim()).find(Boolean) || undefined;

    const nameNorm = normalizeTerm(name);
    const synonyms: string[] = []; // keep empty on ingest; you can enrich later
    const synonymsNorm: string[] = []; // derived when synonyms exist

    const doc: DrugsRefDoc = {
      displayName: name,
      dmdType,
      dmplusdCode: code,
      isActive,
      name,
      nameNorm,
      parentDmplusdCode: parent,
      sourceVersion,
      synonyms,
      synonymsNorm,
      updatedAt: new Date(),
    };

    return doc;
  }

  const parser = sax.createStream(true, { trim: true });

  parser.on("opentag", (node: sax.Tag) => {
    const tag = node.name;
    if (tag === rootTag) {
      current = { _tag: rootTag };
      return;
    }
    if (!current) return;

    // Capture text for a small set of tags
    const allow = new Set([
      ...idTagCandidates,
      "NM",
      "INVALID",
      ...parentTagCandidates,
    ]);
    if (allow.has(tag)) {
      currentTextTag = tag;
      currentText = "";
    }
  });

  parser.on("text", (text: string) => {
    if (!current || !currentTextTag) return;
    currentText += text;
  });

  parser.on("closetag", (tag: string) => {
    if (current && currentTextTag && tag === currentTextTag) {
      current[currentTextTag] = (currentText ?? "").trim();
      currentTextTag = null;
      currentText = "";
      return;
    }

    if (tag === rootTag && current) {
      totalSeen++;
      const doc = toDoc(current);
      current = null;

      if (doc) {
        pendingOps.push({
          updateOne: {
            filter: { dmplusdCode: doc.dmplusdCode },
            update: { $set: doc },
            upsert: true,
          },
        });
      }

      if (pendingOps.length >= batchSize) {
        // Avoid backpressure issues: pause stream while flushing
        (parser as any)._parser?.pause?.();
        flushChain = flushChain
          .then(async () => {
            await flush();
          })
          .then(() => {
            (parser as any)._parser?.resume?.();
          })
          .catch((err) => {
            flushError = err instanceof Error ? err : new Error(String(err));
            parser.emit("error", flushError);
          });
      }
    }
  });

  parser.on("error", () => {});

  async function finish() {
    await flushChain;
    if (flushError) throw flushError;
    await flush();
    return { totalSeen, totalUpserts };
  }

  return { finish, parser };
}

async function ingestXmlEntry(opts: {
  batchSize: number;
  collection: Collection<DrugsRefDoc>;
  dmdType: DmdType;
  dryRun: boolean;
  entry: unzipper.Entry;
  sourceVersion: string;
}) {
  const { entry, dmdType, sourceVersion, collection, dryRun, batchSize } = opts;

  const { parser, finish } = createSaxRowIngestor({
    batchSize,
    collection,
    dmdType,
    dryRun,
    sourceVersion,
  });

  await new Promise<void>((resolve, reject) => {
    const maybeStreamFactory = (entry as any).stream;
    const source =
      typeof maybeStreamFactory === "function"
        ? maybeStreamFactory.call(entry)
        : (entry as any);

    if (!source || typeof source.pipe !== "function") {
      reject(
        new TypeError(
          `ZIP entry '${(entry as any)?.path ?? "unknown"}' is not streamable`,
        ),
      );
      return;
    }

    source.on("error", reject);
    source.pipe(parser).on("end", resolve).on("error", reject);
  });

  return await finish();
}

async function main() {
  const args = parseArgs(process.argv);

  const zipPath = path.resolve(args.zip);
  if (!fs.existsSync(zipPath)) throw new Error(`ZIP not found: ${zipPath}`);

  const { client, collection } = await getMongoCollection();
  try {
    // Optional: ensure indexes exist (run once; safe to run repeatedly)
    await collection.createIndex({ dmplusdCode: 1 }, { unique: true });
    await collection.createIndex({ dmdType: 1, isActive: 1 });
    await collection.createIndex({ snomedCode: 1 });
    await collection.createIndex({ nameNorm: 1 });

    const directory = await unzipper.Open.file(zipPath);

    // IMPORTANT: unzipper returns entry descriptors; we must open streams from directory.files
    const entries = directory.files as unknown as unzipper.Entry[];

    const picks = chooseXmlEntries(entries, args.types);

    const results: any[] = [];

    for (const t of [...args.types]) {
      const entry = picks[t];
      const r = await ingestXmlEntry({
        batchSize: args.batchSize,
        collection,
        dmdType: t,
        dryRun: args.dryRun,
        entry,
        sourceVersion: args.sourceVersion,
      });
      results.push({ type: t, file: entry.path, ...r });
    }

    // Minimal report
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `[${r.type}] file=${r.file} seen=${r.totalSeen} upserts~=${r.totalUpserts} dryRun=${args.dryRun}`,
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
