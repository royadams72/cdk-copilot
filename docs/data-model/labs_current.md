# labs_current

**Purpose:** Materialized “latest state” view of laboratory results per patient + test code (fast reads for dashboards, alerts, and “current” values).

**Contains Personally Identifiable Information (PII):** No (references only)

**Access:**

- Staff: `labs.read`, `labs.write`
- Patients: read their own results if enabled

## Design

- **Current model:** one document per `(orgId, patientId, code, unit)` (or per `(orgId, patientId, code)` if you normalize unit).
- **Write path:** whenever a new ledger entry is inserted into `labs_ledger`, upsert `labs_current` if the new entry is more recent (`takenAt`, then `reportedAt`).
- **Source of truth:** `labs_ledger` is canonical; `labs_current` is derived.
- **Corrections:** if a ledger row is `status="corrected"`, the current doc should point to the correcting row (and optionally keep `prevLedgerId`).

## Fields

| Field           |             Type | Required | Notes                                                                                                                                          |
| --------------- | ---------------: | :------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`           |         ObjectId |    ✅    | Primary key (PK)                                                                                                                               |
| `orgId`         |           string |    ✅    | Tenant/organisation identifier                                                                                                                 |
| `patientId`     |         ObjectId |    ✅    | Reference to `patients._id`                                                                                                                    |
| `code`          |           string |    ✅    | Test code (prefer Logical Observation Identifiers Names and Codes (LOINC) or Systematized Nomenclature of Medicine Clinical Terms (SNOMED CT)) |
| `name`          |           string |    ✅    | Denormalised display name                                                                                                                      |
| `value`         | number \| string |    ✅    | Latest value                                                                                                                                   |
| `unit`          |   string \| null |    ⛔️    | Latest unit                                                                                                                                    |
| `takenAt`       |             Date |    ✅    | Latest sample collection timestamp                                                                                                             |
| `reportedAt`    |     Date \| null |    ⛔️    | Latest reported/authorised timestamp                                                                                                           |
| `source`        |             enum |    ✅    | `import` \| `integration` \| `manual`                                                                                                          |
| `status`        |             enum |    ✅    | `final` \| `corrected` \| `preliminary` \| `cancelled`                                                                                         |
| `abnormalFlag`  |     enum \| null |    ⛔️    | `L` \| `LL` \| `H` \| `HH` \| `A` \| `N` if supplied                                                                                           |
| `ledgerId`      |         ObjectId |    ✅    | Pointer to the ledger row that produced this current value                                                                                     |
| `prevLedgerId`  | ObjectId \| null |    ⛔️    | Optional pointer to prior ledger row replaced by this current value                                                                            |
| `updatedReason` |   string \| null |    ⛔️    | Operational reason (e.g., “new import”, “correction applied”)                                                                                  |
| `createdAt`     |             Date |    ✅    | Created timestamp                                                                                                                              |
| `updatedAt`     |             Date |    ✅    | Updated timestamp                                                                                                                              |
| `createdBy`     |           string |    ✅    | Principal identifier                                                                                                                           |
| `updatedBy`     |           string |    ✅    | Principal identifier                                                                                                                           |

## Example document

```json
{
  "_id": { "$oid": "66fb10a2e1b3d0c5a4f1d777" },
  "orgId": "org_rf_london",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "code": "33914-3",
  "name": "eGFR",
  "value": 42,
  "unit": "mL/min/1.73m²",
  "takenAt": "2025-09-28T08:30:00.000Z",
  "reportedAt": "2025-09-28T12:05:00.000Z",
  "source": "import",
  "status": "final",
  "abnormalFlag": "L",
  "ledgerId": { "$oid": "66fb00a2e1b3d0c5a4f1d111" },
  "prevLedgerId": null,
  "updatedReason": "new import",
  "createdAt": "2025-09-28T12:05:01.000Z",
  "updatedAt": "2025-09-28T12:05:01.000Z",
  "createdBy": "bdea23a9-405b-4abd-b51e-d996047cf063",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063"
}
```

## Indexes

```js
// Uniqueness for “current value per test”
db.labs_current.createIndex(
  { orgId: 1, patientId: 1, code: 1, unit: 1 },
  { unique: true },
);

// Patient “latest values” dashboard
db.labs_current.createIndex({ orgId: 1, patientId: 1 });

// Fast lookup by test across org/patient (optional)
db.labs_current.createIndex({ orgId: 1, code: 1 });
```

## Access control

    •	Scopes: labs.read, labs.write.
    •	Row-level: same lane logic as patients.

## Retention

    •	labs_current is derived. It can be rebuilt from labs_ledger.
    •	Keep as long as you keep the ledger, or rebuild on demand after retention events.

## Notes

    •	Prefer updating labs_current in the same ingestion transaction/workflow that writes labs_ledger.
    •	When units vary for the same code across sources, either normalize units at ingestion or include unit in the uniqueness key (as above).
