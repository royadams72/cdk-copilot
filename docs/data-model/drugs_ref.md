**Purpose:** Local reference of UK medicines for autocomplete and coding, seeded from **NHS dm+d** (TRUD weekly release).
**Contains PII:** No
**Access:** Read by app server; write by backend ingestion jobs only.

## Fields (summary)

- `_id` · ObjectId · **PK**
- `dmplusdCode` · string (dm+d identifier) · **unique**
- `dmdType` · string · enum: `"VMP" | "AMP" | "VMPP" | "AMPP"`
- `name` · string · dm+d name (as provided)
- `displayName` · string · preferred UI label (defaults to `name`)
- `nameNorm` · string · normalized for search (lowercase, punctuation stripped)
- `synonyms` · string[] · optional aliases (brand/common names/misspellings)
- `synonymsNorm` · string[] · normalized synonyms (same rules as `nameNorm`)
- `form?` · string · e.g., tablet, solution
- `strength?` · string · e.g., 10 mg
- `route?` · string · e.g., oral
- `parentDmplusdCode?` · string · optional grouping/link (e.g., AMP → VMP)
- `isActive` · boolean · derived from dm+d `INVALID` flag (`INVALID=0` → true)
- `isBlacklisted?` · boolean · local formulary exclusions
- `snomedCode?` · string · optional mapping
- `atcCode?` · string · optional mapping (future)
- `updatedAt` · Date
- `sourceVersion` · string · dm+d release identifier/date

## Indexes

```js
// identity / joins
db.drugs_ref.createIndex({ dmplusdCode: 1 }, { unique: true });

// common filtering
db.drugs_ref.createIndex({ dmdType: 1, isActive: 1 });

// optional mappings
db.drugs_ref.createIndex({ snomedCode: 1 });

// fallback search (basic). Prefer Atlas Search for true autocomplete.
db.drugs_ref.createIndex({ nameNorm: 1 });
```

## Autocomplete (recommended)

- **Preferred:** MongoDB Atlas Search `autocomplete` on `nameNorm` and `synonymsNorm`.
- **Fallback (no Atlas Search):** query `nameNorm` with a bounded prefix regex (e.g., `^amlo`) + `isActive: true` and limit results.

## Ingestion Notes

- Source: **NHS dm+d** via **TRUD** weekly ZIP (XML). Import at least **VMP** for generic clinical concepts; optionally add **AMP** for branded products.
- Parse `VMPID`/`AMPID` → `dmplusdCode`, `NM` → `name`, `INVALID` → `isActive`.
- Upsert by `dmplusdCode`; update `sourceVersion` each run.
- Default `displayName = name`; compute `nameNorm` and `synonymsNorm` during ingestion.
- Do not store dosing/regimen here; store patient-specific use in `medications_ledger`.
