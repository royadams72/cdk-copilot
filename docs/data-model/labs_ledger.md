**Purpose:** Append-only ledger of laboratory results (for trends, auditability, corrections, and alerting).

**Contains Personally Identifiable Information (PII):** No (references only)

**Access:**

- Staff: `labs.read`, `labs.write` (imports/integrations/manual entry)
- Patients: read their own results if enabled

## Design

- **Ledger model:** never mutate historical values.
- **Corrections:** write a new row with `status="corrected"` and link to the prior row via `correctionOf`.
- **Display name:** store `name` as denormalised UI label to avoid extra joins.
- **Flags (source/derived/override):**
  - `sourceAbnormalFlag` is preserved as received (or entered explicitly as “source”).
  - `derivedAbnormalFlag` is computed by CKD Copilot from the reference range snapshot / range record.
  - `overrideAbnormalFlag` is a clinician override for that specific reading.
  - `effectiveAbnormalFlag` is stored for fast reads and equals: `overrideAbnormalFlag ?? sourceAbnormalFlag ?? derivedAbnormalFlag`.
  - `derivedFromRangeId` / `derivedFromRangeVersion` are only written when `derivedAbnormalFlag` is the chosen `effectiveAbnormalFlag`.
  - Do not change historical rows because ranges change; write a correction row when needed.
  - **Update rule:** Only a trusted integration source may set `sourceAbnormalFlag`, and only a clinician may set or change `overrideAbnormalFlag`. Patients and automated derivation logic must never directly modify these fields; they may only influence `derivedAbnormalFlag` via recalculation and must write a correction row if interpretation changes.
- **Codes:** prefer **Logical Observation Identifiers Names and Codes (LOINC)**, otherwise **Systematized Nomenclature of Medicine Clinical Terms (SNOMED CT)**.

## Fields

| Field                     |                     Type | Required | Notes                                                                                        |
| ------------------------- | -----------------------: | :------: | -------------------------------------------------------------------------------------------- |
| `_id`                     |                 ObjectId |    ✅    | Primary key (PK)                                                                             |
| `orgId`                   |                   string |    ✅    | Tenant/organisation identifier                                                               |
| `patientId`               |                 ObjectId |    ✅    | Reference to `patients._id`                                                                  |
| `code`                    |                   string |    ✅    | Test code (prefer LOINC/SNOMED CT)                                                           |
| `name`                    |                   string |    ✅    | Denormalised display name (e.g., `eGFR`)                                                     |
| `value`                   |         number \| string |    ✅    | Numeric value or categorical value (e.g., `positive`)                                        |
| `unit`                    |           string \| null |    ⛔️    | Unit (e.g., `mL/min/1.73m²`, `mmol/L`)                                                       |
| `refRange`                |           object \| null |    ⛔️    | Snapshot range used for display/derivation at write-time (do not recompute historical rows)  |
| `refRange.low`            |           number \| null |    ⛔️    | Lower bound                                                                                  |
| `refRange.high`           |           number \| null |    ⛔️    | Upper bound                                                                                  |
| `refRange.text`           |           string \| null |    ⛔️    | Human text (e.g., `A2: 3–30 mg/mmol`)                                                        |
| `derivedFromRangeId`      |         ObjectId \| null |    ⛔️    | Reference to `labs_reference_ranges` record used to derive flags (if applicable)             |
| `derivedFromRangeVersion` | string \| number \| null |    ⛔️    | Optional range version (fallback: range `updatedAt` ISO string)                                |
| `takenAt`                 |                     Date |    ✅    | Sample collection timestamp                                                                  |
| `reportedAt`              |             Date \| null |    ⛔️    | Reported/authorised timestamp                                                                |
| `source`                  |                     enum |    ✅    | `import` \| `integration` \| `manual` (default: `import`)                                    |
| `status`                  |                     enum |    ✅    | `final` \| `corrected` \| `preliminary` \| `cancelled` (default: `final`)                    |
| `latestReason`            |           string \| null |    ⛔️    | Reason for edit/correction                                                                   |
| `correctionOf`            |         ObjectId \| null |    ⛔️    | Points to the prior ledger row this corrects                                                 |
| `sourceAbnormalFlag`      |             enum \| null |    ⛔️    | `L` \| `LL` \| `H` \| `HH` \| `A` \| `N` as supplied by lab or entered as “source”           |
| `derivedAbnormalFlag`     |             enum \| null |    ⛔️    | Computed by CKD Copilot using `refRange` or `labs_reference_ranges`                          |
| `overrideAbnormalFlag`    |             enum \| null |    ⛔️    | Clinician override for this specific reading                                                 |
| `effectiveAbnormalFlag`   |             enum \| null |    ⛔️    | Stored effective flag used by UI/alerts: override ?? source ?? derived                       |
| `note`                    |           string \| null |    ⛔️    | Operational note (non-PII)                                                                   |
| `createdAt`               |                     Date |    ✅    | Created timestamp                                                                            |
| `updatedAt`               |                     Date |    ✅    | Updated timestamp                                                                            |
| `createdBy`               |                   string |    ✅    | Principal identifier (from `patients` or `users_accounts`)                                   |
| `updatedBy`               |                   string |    ✅    | Principal identifier (from `patients` or `users_accounts`)                                   |

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
  "derivedFromRangeId": { "$oid": "66fb00a2e1b3d0c5a4f1d999" },
  "derivedFromRangeVersion": 3,
  "derivedAbnormalFlag": "L",
  "takenAt": "2025-09-28T08:30:00.000Z",
  "reportedAt": "2025-09-28T12:05:00.000Z",
  "source": "import",
  "status": "final",
  "sourceAbnormalFlag": null,
  "overrideAbnormalFlag": null,
  "effectiveAbnormalFlag": "L",
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
- For UI evaluation, resolve reference ranges from `labs_reference_ranges` when the lab does not supply `refRange`, but persist the resolved `refRange` (snapshot) and optionally `derivedFromRangeId`/`derivedFromRangeVersion` so historical interpretation is auditable.
