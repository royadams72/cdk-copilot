# medications_ledger (Medications Ledger)

**Purpose:** Record a patient’s append-only timeline of medicines, dosages, and status. per user
**Contains PII (Personally Identifiable Information):** No (references only)
**Access:** Staff and Patients with `medications.read` (view) and `medications.write` (create/update).

## Fields (summary)

- `_id` · ObjectId · **Primary Key (PK)**
- `orgId` · string
- `patientId` · ObjectId (ref: patients)
- `drugRefId` · ObjectId (ref: drugs_ref) · preferred
- `dmplusdCode?` · string · NHS dm+d code (Dictionary of Medicines and Devices)
- `snomedCode?` · string
- `name` · string · denormalised label (from `drugs_ref` for quick display)
- `form?` · string (tablet, solution)
- `route?` · string (oral, IV)
- `dose` · string (free text or structured, e.g., `10 mg`)
- `frequency` · string (e.g., `once daily`)
- `instructions?` · string (SIG / special notes)
- `latestReason` · string reason for edit
- `startAt` · Date & Time
- `endAt?` · Date & Time
- `status` · enum (`active|paused|stopped|completed`)
- `source` · enum (`manual|import|integration`) · default `manual`
- `createdAt` / `updatedAt` · Date & Time
- `createdBy` / `updatedBy` · string ref: `principalId` from patients or users_accounts

## Example

```json
{
  "_id": { "$oid": "66fa10a2e1b3d0c5a4f1c001" },
  "orgId": "org_rf_london",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "drugRefId": { "$oid": "66fa1092e1b3d0c5a4f1bf90" },
  "dmplusdCode": "123456789",
  "snomedCode": "987654321",
  "name": "Sevelamer 800 mg tablet",
  "form": "tablet",
  "strength": "800 mg",
  "route": "oral",
  "dose": "800 mg",
  "frequency": "three times daily with meals",
  "instructions": "Swallow whole with water.",
  "startAt": "the date/time the patient started taking this regimen” (effective date)",
  "status": "active",
  "source": "manual",
  "createdAt": "Date Time",
  "updatedAt": "Date Time"
}
```

## Access Control

- Scopes: medications.read (GET), medications.write (POST/PATCH).
- Row-level scope: same lane logic as patients:
- orgId === user.orgId AND (facilityId/careTeamId via patient join or patientId ∈ allowedPatientIds).

```js
db.medications.createIndex({ orgId: 1, patientId: 1, status: 1 });
db.medications.createIndex({ patientId: 1, startAt: -1 });
db.medications.createIndex({ dmplusdCode: 1 });
```

## Retention

- Retain with the patient record. Do not delete historical rows; mark with status and endAt.

# medications_ledger (Medications Ledger — Event Stream)

**Purpose:** Record a patient’s **append-only** timeline of medication events (create, edits, status changes). Each document is a single event.

**Contains PII (Personally Identifiable Information):** No (references only)

**Access:** Staff and Patients with `medications.read` (view) and `medications.write` (create/update).

---

## Concept

- `medications_ledger` is the **source of truth**.
- A “medication” is identified by a stable **`medicationId`** (ObjectId).
- Any change (name, dose, frequency, route, start date, codes, status) is recorded as a **new event document**.
- **Do not update or delete** ledger documents.

A separate projection collection (`medications_current`) stores the current snapshot for fast reads (see `medications_current.md`).

---

## Fields (event document)

- `_id` · ObjectId · **Primary Key (PK)** (event id)
- `orgId` · string (optional; include if you use org scoping on this collection)
- `patientId` · ObjectId (ref: patients)
- `medicationId` · ObjectId (**stable id** for the medication entity)
- `eventType` · enum
  - `created`
  - `name_changed`
  - `dose_changed`
  - `frequency_changed`
  - `route_changed`
  - `form_changed`
  - `startAt_changed`
  - `instructions_changed`
  - `dmplusdCode_changed`
  - `snomedCode_changed`
  - `drugRefId_changed`
  - `status_changed`
- `at` · Date & Time (event timestamp)
- `by` · string (ref: `principalId` from patients or users_accounts)
- `reason?` · string (reason for edit/status change)
- `data?` · object (event payload; typically includes `from` and `to`)

### `data` conventions

- For `*_changed` events, store:
  - `data.from` (previous value)
  - `data.to` (next value)
- For `created`, store the initial snapshot as fields inside `data` (e.g., `name`, `dose`, `frequency`, `route`, `form`, `startAt`, codes, `status`).

---

## Examples

### 1) Created

```json
{
  "_id": { "$oid": "66fa10a2e1b3d0c5a4f1c001" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "medicationId": { "$oid": "66fa10a2e1b3d0c5a4f1c111" },
  "eventType": "created",
  "at": { "$date": "2026-02-18T10:15:00.000Z" },
  "by": "patient:66f1b7e9c2ab4a0c9f3a1e21",
  "data": {
    "name": "Sevelamer 800 mg tablet",
    "dose": "800 mg",
    "frequency": "three times daily with meals",
    "route": "oral",
    "form": "tablet",
    "instructions": "Swallow whole with water.",
    "startAt": "2026-02-01T00:00:00.000Z",
    "status": "active",
    "dmplusdCode": "123456789",
    "snomedCode": "987654321",
    "drugRefId": "66fa1092e1b3d0c5a4f1bf90"
  }
}
```

### 2) Dose changed

```json
{
  "_id": { "$oid": "66fa10a2e1b3d0c5a4f1c002" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "medicationId": { "$oid": "66fa10a2e1b3d0c5a4f1c111" },
  "eventType": "dose_changed",
  "at": { "$date": "2026-02-18T10:20:00.000Z" },
  "by": "patient:66f1b7e9c2ab4a0c9f3a1e21",
  "reason": "Dose adjustment after labs",
  "data": { "from": "800 mg", "to": "1600 mg" }
}
```

### 3) Status changed

```json
{
  "_id": { "$oid": "66fa10a2e1b3d0c5a4f1c003" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "medicationId": { "$oid": "66fa10a2e1b3d0c5a4f1c111" },
  "eventType": "status_changed",
  "at": { "$date": "2026-02-18T10:25:00.000Z" },
  "by": "patient:66f1b7e9c2ab4a0c9f3a1e21",
  "reason": "Side effects",
  "data": { "from": "active", "to": "paused" }
}
```

---

## Access Control

- Scopes: `medications.read` (GET), `medications.write` (POST/PATCH)
- Row-level scope: same lane logic as patients:
  - `orgId === user.orgId` AND (facilityId/careTeamId via patient join or `patientId ∈ allowedPatientIds`).

---

## Indexes

Recommended indexes for an event ledger:

```js
// Replay events for a single medication entity (oldest -> newest)
db.medications_ledger.createIndex({ patientId: 1, medicationId: 1, at: 1 });

// Recent activity / timelines
// (If you use orgId here, prefer { orgId: 1, patientId: 1, at: -1 } instead)
db.medications_ledger.createIndex({ patientId: 1, at: -1 });

// Optional: help filter by type for analytics/auditing
// db.medications_ledger.createIndex({ patientId: 1, eventType: 1, at: -1 });
```

---

## Retention

- Retain with the patient record.
- Do not delete historical rows.
- Corrections are new events (e.g., a follow-up `name_changed` event), never edits-in-place.
