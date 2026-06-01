# medications_current (Medications Current — Projection)

**Purpose:** Store the **current snapshot** of each medication for fast reads. This is a **projection** derived from `medications_ledger`.

**Contains PII (Personally Identifiable Information):** No (references only)

**Access:** Staff and Patients with `medications.read` (view) and `medications.write` (create/update).

---

## Concept

- `medications_ledger` is the source of truth (append-only).
- `medications_current` is a **materialized view** (current state per `medicationId`).
- This collection may be **updated in place** as events arrive.
- If `medications_current` is missing or out-of-date, it can be rebuilt by replaying the ledger.

---

## Fields (snapshot document)

- `_id` · ObjectId · **Primary Key (PK)** (recommended: same value as `medicationId`)
- `orgId` · string (optional; include if you use org scoping on this collection)
- `patientId` · ObjectId (ref: patients)
- `medicationId` · ObjectId (**stable id** for the medication entity; should equal `_id` if you choose that pattern)

### Medication details (current)

- `name` · string
- `dose` · string
- `frequency` · string
- `route` · string
- `form` · string
- `instructions` · string
- `startAt` · Date & Time (nullable)
- `endAt` · Date & Time (nullable; set when `status` becomes `stopped` or `completed`)
- `status` · enum (`active|paused|stopped|completed`)

### Codes / references (current)

- `drugRefId` · ObjectId (ref: drugs_ref) (nullable)
- `dmplusdCode` · string (Dictionary of Medicines and Devices) (nullable)
- `snomedCode` · string (nullable)

### Audit / projection metadata

- `updatedAt` · Date & Time (when projection last updated)
- `updatedBy` · string (ref: `principalId`)
- `lastEventAt` · Date & Time (timestamp of the last applied ledger event)
- `lastEventId` · ObjectId (event `_id` that was last applied)
- `latestReason` · string (nullable; typically from the last event with a `reason`)

---

## Example

```json
{
  "_id": { "$oid": "66fa10a2e1b3d0c5a4f1c111" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "medicationId": { "$oid": "66fa10a2e1b3d0c5a4f1c111" },

  "name": "Sevelamer 800 mg tablet",
  "dose": "1600 mg",
  "frequency": "three times daily with meals",
  "route": "oral",
  "form": "tablet",
  "instructions": "Swallow whole with water.",
  "startAt": { "$date": "2026-02-01T00:00:00.000Z" },
  "endAt": null,
  "status": "paused",

  "drugRefId": { "$oid": "66fa1092e1b3d0c5a4f1bf90" },
  "dmplusdCode": "123456789",
  "snomedCode": "987654321",

  "latestReason": "Side effects",
  "updatedAt": { "$date": "2026-02-18T10:25:00.000Z" },
  "updatedBy": "patient:66f1b7e9c2ab4a0c9f3a1e21",
  "lastEventAt": { "$date": "2026-02-18T10:25:00.000Z" },
  "lastEventId": { "$oid": "66fa10a2e1b3d0c5a4f1c003" }
}
```

## Access Control

- • `Scopes`: medications.read (GET), medications.write (POST/PATCH)
- • `Row-level scope`: same lane logic as patients:
- • matching active patient assignment via patient join (`orgId` plus `facilityId` or `careTeamId`), or `patientId ∈ allowedPatientIds`.

⸻

Indexes

```js
// Fast list/query of current meds by patient and status
db.medications_current.createIndex({ patientId: 1, status: 1, startAt: -1 });

// Ensure one snapshot per medication entity (choose ONE unique strategy)
db.medications_current.createIndex(
  { patientId: 1, medicationId: 1 },
  { unique: true },
);

// Optional, if org-scoped
// db.medications_current.createIndex({ orgId: 1, patientId: 1, status: 1 });
```

### Retention

- • Retain with the patient record.
- • This is a projection; it can be rebuilt from medications_ledger.
- • Do not treat this as audit history; audit history is in the ledger.
