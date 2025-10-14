**Purpose:** Local reference of medicines (names, codes, forms) seeded from **NHS dm+d**; optional maps to SNOMED CT / RxNorm.
**Contains PII:** No
**Access:** Read by app server; write by backend jobs only.

## Fields (summary)

- `_id` · ObjectId · **PK**
- `dmplusdCode` · string (dm+d code) · unique
- `snomedCode?` · string
- `rxnormCode?` · string (optional, US)
- `name` · string (e.g., VMP/VMPP preferred term)
- `form?` · string (e.g., tablet, solution)
- `strength?` · string (e.g., 10 mg)
- `route?` · string (e.g., oral)
- `isBlacklisted?` · boolean (local formulary exclusions)
- `synonyms` · string[] (for search)
- `atcCode?` · string (if you later map ATC)
- `updatedAt` · Date
- `sourceVersion` · string (dm+d release version/date)

## Indexes

```js
db.drugs_ref.createIndex({ dmplusdCode: 1 }, { unique: true });
db.drugs_ref.createIndex({ name: "text", synonyms: "text" });
db.drugs_ref.createIndex({ snomedCode: 1 });
```

## Ingestion Notes

- Schedule a job to import dm+d releases and upsert by dmplusdCode.
- Keep a small sourceVersion log for traceability.
- Do not store dosing advice here—keep that in separate clinical guidance tables if needed.
