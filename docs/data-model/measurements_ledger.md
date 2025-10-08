# measurements_ledger (Measurement Ledger)

**Purpose:** Single, append-only timeline of measurements (vitals, activity, labs) per user.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `userId`.
**Access:** User (self), app server; clinicians if assigned. All access **audited** (who/when/which id).
**Notes:** Store both **`measuredAt`** (when taken) and **`receivedAt`** (ingest time) to handle out‑of‑order device syncs.

## Shape (summary)

- `kind` · string · one of: `weight`, `blood_pressure`, `heart_rate`, `steps`, `sleep`, `egfr`, `creatinine`, `acr`
- `userId` · string · **FK (Foreign Key)** → `users_pii.id`
- `measuredAt` · Date · when the measurement happened
- `receivedAt` · Date · when the app stored it
- `source` · `user|device|api|provider`
- `device` · { name?, platform?, externalId? }
- `notes` · string?
- **Fields per kind:**

  - **weight:** `valueKg` (kg)
  - **blood_pressure:** `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
  - **heart_rate:** `bpm`
  - **steps:** `count`
  - **sleep:** `durationMin`, `quality?` (`poor|fair|good|excellent`)
  - **egfr (estimated Glomerular Filtration Rate):** `value` (mL/min/1.73m²), `method?` (`CKD-EPI-2009|CKD-EPI-2021`)
  - **creatinine:** `value`, `units` (`µmol/L|mg/dL`)
  - **acr (Albumin-to-Creatinine Ratio):** `value`, `units` (`mg/g|mg/mmol`), `category?` (`A1|A2|A3`)

## Example documents

```json
{
  "kind": "weight",
  "userId": "u_123",
  "measuredAt": "2025-09-25T07:31:00Z",
  "receivedAt": "2025-09-25T07:31:05Z",
  "source": "device",
  "device": { "name": "Withings Body+" },
  "valueKg": 84.7
}
```

```json
{
  "kind": "blood_pressure",
  "userId": "u_123",
  "measuredAt": "2025-09-26T08:10:00Z",
  "source": "user",
  "systolicMmHg": 128,
  "diastolicMmHg": 82,
  "pulseBpm": 72
}
```

```json
{
  "kind": "egfr",
  "userId": "u_123",
  "measuredAt": "2025-09-10T09:00:00Z",
  "source": "provider",
  "value": 42,
  "method": "CKD-EPI-2021",
  "units": "mL/min/1.73m²",
  "lab": { "name": "NHS Lab" }
}
```

## Indexes (MongoDB shell)

```js
db.measurements_ledger.createIndex({ userId: 1, kind: 1, measuredAt: -1 }); // latest-by-kind
db.measurements_ledger.createIndex({ userId: 1, measuredAt: -1 }); // timelines
db.measurements_ledger.createIndex(
  { "device.externalId": 1 },
  { sparse: true, unique: true }
); // dedupe
```

## API snippets

```ts
// POST /api/measurements — append one
import { Measurement } from "@/zod-schemas/measurements";
export async function POST(req: Request) {
  const json = await req.json();
  json.receivedAt = new Date();
  const parsed = Measurement.safeParse(json);
  if (!parsed.success)
    return Response.json({ issues: parsed.error.flatten() }, { status: 422 });
  await db.collection("measurements_ledger").insertOne(parsed.data);
  return new Response(null, { status: 201 });
}
```

```ts
// GET /api/measurements/latest?kind=weight — last of a kind
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind")!;
  const claims = await getClaims(req);
  const doc = await db
    .collection("measurements_ledger")
    .find({ userId: claims.sub, kind })
    .sort({ measuredAt: -1 })
    .limit(1)
    .next();
  return Response.json(doc ?? null);
}
```

## Privacy & retention

- Treat as **Clinical**: restrict by role, audit all reads/writes; no payloads in logs.
- Keep forever unless policy dictates otherwise; you can summarise or downsample old activity data.

---

# /docs/data-model/nutrition_ledger.md
