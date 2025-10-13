**Purpose:** Store laboratory results (e.g., eGFR, creatinine, phosphate, potassium) for trend charts and alerts.
**Contains PII:** No (references only)
**Access:** Staff with `labs.read` and `labs.write` (imports). Patients may read their own if enabled.

## Fields (summary)

- `_id` · ObjectId · **PK**
- `orgId` · string
- `patientId` · ObjectId (ref: patients)
- `code` · string · test code (prefer LOINC or SNOMED where available)
- `name` · string · denormalised display name (e.g., `eGFR`)
- `value` · number|string · numeric value or categorical (e.g., `positive`)
- `unit?` · string (e.g., `mL/min/1.73m²`, `mmol/L`)
- `refRange?` · { `low?`: number, `high?`: number, `text?`: string }
- `takenAt` · Date · when sample collected
- `reportedAt?` · Date · when result reported
- `source` · enum (`import|integration|manual`) · default `import`
- `status` · enum (`final|corrected|preliminary|cancelled`) · default `final`
- `abnormalFlag?` · enum (`L|LL|H|HH|A|N`) · low/high/abnormal/normal flags if supplied
- `note?` · string (non-PII operational note)
- `createdAt` / `updatedAt` · Date

## Example

```json
{
  "_id": { "$oid": "66fb00a2e1b3d0c5a4f1d111" },
  "orgId": "org_rf_london",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "code": "33914-3",
  "name": "eGFR",
  "value": 42,
  "unit": "mL/min/1.73m²",
  "refRange": { "low": 60 },
  "takenAt": "2025-09-28T08:30:00.000Z",
  "reportedAt": "2025-09-28T12:05:00.000Z",
  "source": "import",
  "status": "final",
  "abnormalFlag": "L",
  "createdAt": "2025-09-28T12:05:01.000Z",
  "updatedAt": "2025-09-28T12:05:01.000Z"
}
```

```js
db.labs.createIndex({ orgId: 1, patientId: 1, takenAt: -1 });
db.labs.createIndex({ orgId: 1, patientId: 1, code: 1, takenAt: -1 });
db.labs.createIndex({ code: 1, takenAt: -1 });
```

## Access Control

- Scopes: labs.read, labs.write.
- Row-level scope: same lane logic as patients (org + facility/team or allowedPatientIds).

## Retention

- Retain per clinical records policy. Never mutate values; corrections should create a new row with status="corrected" where applicable.

## Notes

- Prefer LOINC or SNOMED CT test codes; store the display name denormalised for UI.
- Keep units consistent per test; convert at ingestion if needed and record the original in an integration log if you require full provenance.
