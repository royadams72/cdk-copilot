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
- `strength?` · string (e.g., `10 mg`)
- `route?` · string (oral, IV)
- `dose` · string (free text or structured, e.g., `10 mg`)
- `frequency` · string (e.g., `once daily`)
- `instructions?` · string (SIG / special notes)
- `startAt` · Date
- `endAt?` · Date
- `status` · enum (`active|paused|stopped|completed`)
- `authorUserId?` · string (ref: users_accounts.authId; who created/last edited)
- `source` · enum (`manual|import|integration`) · default `manual`
- `createdAt` / `updatedAt` · Date

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
  "startAt": "2025-09-01T00:00:00.000Z",
  "status": "active",
  "authorUserId": "cognito|abc123",
  "source": "manual",
  "createdAt": "2025-09-01T10:00:00.000Z",
  "updatedAt": "2025-10-08T18:44:00.000Z"
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
