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
- `latestReason` · string reason for edit
- `correctionOf?` · ObjectId (if this row corrects another)
- `abnormalFlag?` · enum (`L|LL|H|HH|A|N`) · low/high/abnormal/normal flags if supplied
- `note?` · string (non-PII operational note)
- `createdAt` / `updatedAt` · Date
- `createdBy` / `updatedBy` · string ref: `principalId` from patients or users_accounts

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
  "correctionOf": { "$oid": "66fb00a2e129040c5a1d111" },
  "createdAt": "2025-09-28T12:05:01.000Z",
  "updatedAt": "2025-09-28T12:05:01.000Z",
  "createdBy": "bdea23a9-405b-4abd-b51e-d996047cf063",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063"
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

# labs_ledger

**Purpose:** Append-only ledger of laboratory results (for trends, auditability, corrections, and alerting).

**Contains Personally Identifiable Information (PII):** No (references only)

**Access:**

- Staff: `labs.read`, `labs.write` (imports/integrations/manual entry)
- Patients: read their own results if enabled

## Design

- **Ledger model:** never mutate historical values.
- **Corrections:** write a new row with `status="corrected"` and link to the prior row via `correctionOf`.
- **Display name:** store `name` as denormalised UI label to avoid extra joins.
- **Codes:** prefer **Logical Observation Identifiers Names and Codes (LOINC)**, otherwise **Systematized Nomenclature of Medicine Clinical Terms (SNOMED CT)**.

## Fields

| Field           |             Type | Required | Notes                                                                              |
| --------------- | ---------------: | :------: | ---------------------------------------------------------------------------------- |
| `_id`           |         ObjectId |    ✅    | Primary key (PK)                                                                   |
| `orgId`         |           string |    ✅    | Tenant/organisation identifier                                                     |
| `patientId`     |         ObjectId |    ✅    | Reference to `patients._id`                                                        |
| `code`          |           string |    ✅    | Test code (prefer LOINC/SNOMED CT)                                                 |
| `name`          |           string |    ✅    | Denormalised display name (e.g., `eGFR`)                                           |
| `value`         | number \| string |    ✅    | Numeric value or categorical value (e.g., `positive`)                              |
| `unit`          |   string \| null |    ⛔️    | Unit (e.g., `mL/min/1.73m²`, `mmol/L`)                                             |
| `refRange`      |   object \| null |    ⛔️    | Range for display; may be supplied by lab or resolved from `labs_reference_ranges` |
| `refRange.low`  |   number \| null |    ⛔️    | Lower bound                                                                        |
| `refRange.high` |   number \| null |    ⛔️    | Upper bound                                                                        |
| `refRange.text` |   string \| null |    ⛔️    | Human text (e.g., `A2: 3–30 mg/mmol`)                                              |
| `takenAt`       |             Date |    ✅    | Sample collection timestamp                                                        |
| `reportedAt`    |     Date \| null |    ⛔️    | Reported/authorised timestamp                                                      |
| `source`        |             enum |    ✅    | `import` \| `integration` \| `manual` (default: `import`)                          |
| `status`        |             enum |    ✅    | `final` \| `corrected` \| `preliminary` \| `cancelled` (default: `final`)          |
| `latestReason`  |   string \| null |    ⛔️    | Reason for edit/correction                                                         |
| `correctionOf`  | ObjectId \| null |    ⛔️    | Points to the prior ledger row this corrects                                       |
| `abnormalFlag`  |     enum \| null |    ⛔️    | `L` \| `LL` \| `H` \| `HH` \| `A` \| `N` (low/high/abnormal/normal) if supplied    |
| `note`          |   string \| null |    ⛔️    | Operational note (non-PII)                                                         |
| `createdAt`     |             Date |    ✅    | Created timestamp                                                                  |
| `updatedAt`     |             Date |    ✅    | Updated timestamp                                                                  |
| `createdBy`     |           string |    ✅    | Principal identifier (from `patients` or `users_accounts`)                         |
| `updatedBy`     |           string |    ✅    | Principal identifier (from `patients` or `users_accounts`)                         |

## Example document

```json
{
  "_id": { "$oid": "66fb00a2e1b3d0c5a4f1d111" },
  "orgId": "org_rf_london",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "code": "33914-3",
  "name": "eGFR",
  "value": 42,
  "unit": "mL/min/1.73m²",
  "refRange": {
    "low": 60,
    "high": null,
    "text": "Below 60 may indicate reduced kidney function"
  },
  "takenAt": "2025-09-28T08:30:00.000Z",
  "reportedAt": "2025-09-28T12:05:00.000Z",
  "source": "import",
  "status": "final",
  "abnormalFlag": "L",
  "latestReason": null,
  "correctionOf": null,
  "note": null,
  "createdAt": "2025-09-28T12:05:01.000Z",
  "updatedAt": "2025-09-28T12:05:01.000Z",
  "createdBy": "bdea23a9-405b-4abd-b51e-d996047cf063",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063"
}
```

## Indexes

```js
// Patient timeline
db.labs_ledger.createIndex({ orgId: 1, patientId: 1, takenAt: -1 });

// Patient timeline by test
db.labs_ledger.createIndex({ orgId: 1, patientId: 1, code: 1, takenAt: -1 });

// Global test timeline (optional, for analytics)
db.labs_ledger.createIndex({ code: 1, takenAt: -1 });

// Corrections lookup
db.labs_ledger.createIndex({ orgId: 1, correctionOf: 1 });
```

## Access control

- Scopes: `labs.read`, `labs.write`.
- Row-level: same lane logic as `patients` (organisation + facility/team, or explicit `allowedPatientIds`).

## Retention

- Retain per clinical records policy.
- Do not mutate values; represent changes as new rows.

## Notes

- Keep units consistent per `code`; convert at ingestion if required and store original provenance in integration logs.
- For UI evaluation, resolve reference ranges from `labs_reference_ranges` when the lab does not supply `refRange`.
