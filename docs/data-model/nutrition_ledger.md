# nutrition_entries (Nutrition Ledger)

**Purpose:** Food logs per meal with precomputed totals for fast daily/weekly dashboards.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `userId`.
**Access:** User (self), app server; clinicians if assigned. Audited.

## Shape (summary)

- `userId` · string · **FK** → `users_pii.id`
- `eatenAt` · Date · when consumed
- `recordedAt` · Date · when stored
- `mealType` · `breakfast|lunch|dinner|snack|drink`
- `items[]` · list of foods eaten

  - `description` · string
  - `brand?` · string
  - `portion` · { amount, unit (`g|ml|serving|piece`), grams? }
  - `nutrients` · { caloriesKcal?, proteinG?, carbsG?, fatG?, fiberG?, **phosphorusMg?**, **potassiumMg?**, **sodiumMg?** }
  - `source` · `user|barcode|image_ai|api`

- `totals` · same nutrient fields as `items.nutrients`, summed for the entry
- `tags[]` · strings (for example, `"renal-safe"`)
- `photos[]` · URLs
- `recipeId?` · string
- `notes?` · string
- `version` · number

## Example document

```json
{
  "userId": "u_123",
  "eatenAt": "2025-09-26T12:45:00Z",
  "recordedAt": "2025-09-26T12:50:00Z",
  "mealType": "lunch",
  "items": [
    {
      "description": "Chicken breast, grilled",
      "portion": { "amount": 150, "unit": "g", "grams": 150 },
      "nutrients": {
        "caloriesKcal": 247,
        "proteinG": 46,
        "phosphorusMg": 330,
        "potassiumMg": 450,
        "sodiumMg": 100
      },
      "source": "user"
    },
    {
      "description": "White rice, cooked",
      "portion": { "amount": 200, "unit": "g", "grams": 200 },
      "nutrients": {
        "caloriesKcal": 260,
        "proteinG": 5,
        "phosphorusMg": 70,
        "potassiumMg": 55,
        "sodiumMg": 0
      }
    }
  ],
  "totals": {
    "caloriesKcal": 507,
    "proteinG": 51,
    "phosphorusMg": 400,
    "potassiumMg": 505,
    "sodiumMg": 100
  },
  "tags": ["renal-safe", "post-workout"]
}
```

## Indexes (MongoDB shell)

```js
db.nutrition_entries.createIndex({ userId: 1, eatenAt: -1 }); // day views
db.nutrition_entries.createIndex({ userId: 1, mealType: 1, eatenAt: -1 }); // filters
db.nutrition_entries.createIndex({ userId: 1, "totals.phosphorusMg": 1 }); // renal queries
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
      { $match: { userId: claims.sub, eatenAt: { $gte: date, $lt: next } } },
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

- Treat as **Clinical**: scope by `userId`, restrict by role, and audit access.
- Retention policy: keep for user value (trends, goal tracking); allow user to sudo delete individual entries; purge on account deletion.
