# nutrition_entries (Nutrition Ledger)

**Purpose:** Food logs per meal with precomputed totals for fast daily/weekly dashboards.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** User (self), app server; clinicians if assigned. Audited.

## Shape (summary)

- `_id` · ObjectId
- `orgId` · string
- `patientId` · ObjectId (ref: patients)
- `mealType` · `breakfast|lunch|dinner|snack|drink`
- `items[]` · list of foods eaten
  - `foodId` · string
  - `name` · string
  - `quantity` · number
  - `unit` · string
  - `source` · string (e.g., `"manual"`)
  - `nutrients` · { caloriesKcal, proteinG, phosphorusMg, potassiumMg, sodiumMg }
- `totals` · same nutrient fields as `items.nutrients`, summed for the entry
- `createdAt` · Date · when stored
- `updatedAt` · Date · when stored
- `eatenAt` · Date · when consumed

## Example document

```json
{
  "_id": { "$oid": "6730c4b5c53557c78d2d1001" },
  "orgId": "org_demo",
  "patientId": { "$oid": "697249ff7dabc8ebca7aa3ad" },
  "mealType": "lunch",
  "items": [
    {
      "foodId": "fd_grilled_chicken",
      "name": "Grilled chicken breast",
      "quantity": 150,
      "unit": "g",
      "nutrients": {
        "caloriesKcal": 280,
        "proteinG": 46,
        "phosphorusMg": 320,
        "potassiumMg": 350,
        "sodiumMg": 110,
        "phosphorus_protein_ratio": 6.9
      }
    },
    {
      "foodId": "fd_herb_rice",
      "name": "Steamed rice",
      "quantity": 200,
      "unit": "g",
      "nutrients": {
        "caloriesKcal": 260,
        "proteinG": 5,
        "phosphorusMg": 70,
        "potassiumMg": 55,
        "sodiumMg": 0,
        "phosphorus_protein_ratio": 14
      }
    }
  ],
  "totals": {
    "caloriesKcal": 540,
    "proteinG": 51,
    "phosphorusMg": 390,
    "potassiumMg": 405,
    "sodiumMg": 110,
    "phosphorus_protein_ratio": 20.6
  },
  "source": "manual",
  "createdAt": { "$date": "2026-01-20T12:50:00Z" },
  "updatedAt": { "$date": "2026-01-20T12:50:00Z" },
  "eatenAt": { "$date": "2026-01-20T12:45:00Z" }
}
```

## Indexes (MongoDB shell)

```js
db.nutrition_entries.createIndex({ patientId: 1, eatenAt: -1 }); // day views
db.nutrition_entries.createIndex({ patientId: 1, mealType: 1, eatenAt: -1 }); // filters
db.nutrition_entries.createIndex({ patientId: 1, "totals.phosphorusMg": 1 }); // renal queries
```

## API snippets

```ts
// POST /api/nutrition — compute totals server-side
import { NutritionEntry } from "@/zod-schemas/nutrition";
export async function POST(req: Request) {
  const json = await req.json();
  json.recordedAt = new Date();
  json.totals = sumNutrients(json.items); // prevent client tampering
  const parsed = NutritionEntry.safeParse(json);
  if (!parsed.success)
    return Response.json({ issues: parsed.error.flatten() }, { status: 422 });
  await db.collection("nutrition_entries").insertOne(parsed.data);
  return new Response(null, { status: 201 });
}
```

```ts
// GET /api/nutrition/daily?date=2025-09-26 — totals for a day
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = new Date(searchParams.get("date")!);
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const claims = await getClaims(req);
  const agg = await db
    .collection("nutrition_entries")
    .aggregate([
      { $match: { patientId: claims.sub, eatenAt: { $gte: date, $lt: next } } },
      {
        $group: {
          _id: null,
          caloriesKcal: { $sum: "$totals.caloriesKcal" },
          proteinG: { $sum: "$totals.proteinG" },
          phosphorusMg: { $sum: "$totals.phosphorusMg" },
          potassiumMg: { $sum: "$totals.potassiumMg" },
          sodiumMg: { $sum: "$totals.sodiumMg" },
        },
      },
    ])
    .toArray();
  return Response.json(agg[0] ?? null);
}
```

## Privacy & retention

- Treat as **Clinical**: scope by `patientId`, restrict by role, and audit access.
- Retention policy: keep for user value (trends, goal tracking); allow user to sudo delete individual entries; purge on account deletion.
