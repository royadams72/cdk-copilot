// scripts/ingest-cofid.ts
import path from "node:path";
import * as dotenv from "dotenv";

// 1) Load envs before importing anything that uses process.env
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
// If you actually keep them in `.env`, you can also do:
// dotenv.config({ path: path.join(process.cwd(), ".env") });

import type {
  TBaseFoodSchema,
  TNutrientsPer100gSchema,
  NutirentCodesSchema,
  TNutirentCodesSchema,
} from "../packages/core/src/isomorphic/";

// NOTE: no runtime imports (getDb/xlsx) before env is loaded

function normalizeSearchName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function makeKeywords(description: string): string[] {
  const base = normalizeSearchName(description);
  const tokens = base
    .replace(/[,.;:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const extra: string[] = [];
  for (const t of tokens) {
    if (t.endsWith("es")) extra.push(t.slice(0, -2));
    else if (t.endsWith("s")) extra.push(t.slice(0, -1));
  }

  const all = new Set([...tokens, ...extra]);
  return Array.from(all);
}

async function main() {
  // Sanity check: make sure envs are actually loaded here
  console.log("MONGODB_URI =", process.env.MONGODB_URI_APP);

  if (!process.env.MONGODB_URI_APP) {
    throw new Error("Mongo env vars are not set. Check .env/.env.local path.");
  }

  // 2) Now that env is loaded, dynamically import modules that use it
  const xlsxModule = await import("xlsx");
  const xlsx = (xlsxModule as any).default ?? xlsxModule;
  const { getDb } = await import("../apps/api/lib/db/mongodb");

  const db = await getDb();
  const collection = db.collection<TBaseFoodSchema>("base_foods");

  const filePath = path.join(process.cwd(), "data", "cofid.xlsx");
  const workbook = xlsx.readFile(filePath);

  const sheetName = "1.3 Proximates";
  const sheetName2 = "1.4 Inorganics";
  const sheet = workbook.Sheets[sheetName];
  const sheet2 = workbook.Sheets[sheetName2];

  const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: null });
  const rows2: any[] = xlsx.utils.sheet_to_json(sheet2, { defval: null });

  type CofidCell = {
    value: number | null;
    code: "Tr" | "N" | null;
  };

  function parseCofidCell(v: any): CofidCell {
    if (v === null || v === undefined || v === "") {
      return { value: null, code: null };
    }

    if (v === "N") {
      return { value: 0, code: "N" };
    }

    if (v === "Tr") {
      // or 0 if you prefer – but you still keep code: "Tr"
      return { value: 0.5, code: "Tr" };
    }

    const n = Number(v);
    if (Number.isNaN(n)) {
      return { value: null, code: null };
    }

    return { value: n, code: null };
  }
  // console.log("rows.length =", rows.length);

  // if (rows2.length > 0) {
  //   console.log("First row sample:", rows2[0]);
  // }
  // TODO: confirm exact CoFID header names in the file.
  const FOOD_CODE_COL = "Food Code";
  const DESC_COL = "Food Name";
  const GROUP_COL = "Group";

  const KCAL_COL = "Energy (kcal) (kcal)";
  const PROT_COL = "Protein (g)";
  const FAT_COL = "Fat (g)";
  const CARB_COL = "Carbohydrate (g)";
  const K_COL = "Potassium (mg)";
  const P_COL = "Phosphorus (mg)";
  const NA_COL = "Sodium (mg)";

  const docs: TBaseFoodSchema[] = [];
  // function addToNutrients (arr:[]) {

  // }

  for (const row of rows) {
    let nutrients: TNutrientsPer100gSchema;
    let nutirentCodes: TNutirentCodesSchema;
    const code = String(row[FOOD_CODE_COL] ?? "").trim();
    const desc = String(row[DESC_COL] ?? "").trim();
    if (!code || !desc) continue;

    nutrients = {
      energyKcal: parseCofidCell(row[KCAL_COL]).value,
      protein_g: parseCofidCell(row[PROT_COL]).value,
      fat_g: parseCofidCell(row[FAT_COL]).value,
      carbs_g: parseCofidCell(row[CARB_COL]).value,
    };
    nutirentCodes = {
      energyKcal: parseCofidCell(row[KCAL_COL]).code,
      protein_g: parseCofidCell(row[PROT_COL]).code,
      fat_g: parseCofidCell(row[FAT_COL]).code,
      carbs_g: parseCofidCell(row[CARB_COL]).code,
    };

    for (const row2 of rows2) {
      nutrients = {
        ...nutrients,
        potassium_mg: parseCofidCell(row2[K_COL]).value,
        phosphorus_mg: parseCofidCell(row2[P_COL]).value,
        sodium_mg: parseCofidCell(row2[NA_COL]).value,
      };

      nutirentCodes = {
        ...nutirentCodes,
        potassium_mg: parseCofidCell(row2[K_COL]).code,
        phosphorus_mg: parseCofidCell(row2[P_COL]).code,
        sodium_mg: parseCofidCell(row2[NA_COL]).code,
      };
    }
    const searchName = normalizeSearchName(desc);
    const keywords = makeKeywords(desc);

    const doc: TBaseFoodSchema = {
      source: "cofid",
      sourceFoodCode: code,
      description: desc,
      category: row[GROUP_COL] ? String(row[GROUP_COL]) : null,
      searchName,
      keywords,
      nutrientsPer100g: nutrients,
      nutirentCodes,
    };

    docs.push(doc);
  }

  console.log(`Parsed ${docs.length} foods from CoFID`);

  await collection.deleteMany({ source: "cofid" });

  if (docs.length > 0) {
    const result = await collection.insertMany(docs);
    console.log(`Inserted ${result.insertedCount} base_foods from CoFID`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
