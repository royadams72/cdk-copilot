# patients (Operational, Non-PII)

**Purpose:** Operational, non-PII view of patients for listings and dashboards. PII lives in `users_pii`; clinical details in `users_clinical`.
**Contains PII:** No
**Access:** App server for authorised staff (role + scope gated). Support staff via audited tooling.

## Fields (summary)

- `_id` · ObjectId · **Primary Key (PK)** (patient id across the system)
- `orgId` · string · owning organisation
- `facilityId` · string · optional · site/clinic identifier
- `careTeamId` · string · optional · team identifier
- `summary` · object · lightweight UI summary (safe fields only)
  - `lastContactAt` · Date · optional
  - `risk` · enum (`green|amber|red`) · optional
  - `dietitianAssigned` · boolean · optional
  - _(may include additional future keys)_
- `stage` · enum (`1|2|3a|3b|4|5|5D|Tx`) · optional · CKD (Chronic Kidney Disease) stage
- `flags` · string[] · optional · tags like `["diet-support","exercise-plan"]`
- `createdAt` / `updatedAt` · Date (ISO 8601)

## Example

```json
{
  "_id": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "facilityId": "edgware_renal",
  "careTeamId": "ctm_northwest",
  "summary": {
    "lastContactAt": "2025-10-03T09:20:00.000Z",
    "risk": "amber",
    "dietitianAssigned": true
  },
  "stage": "3b",
  "flags": ["diet-support", "exercise-plan"],
  "createdAt": "2025-07-12T10:00:00.000Z",
  "updatedAt": "2025-10-08T18:44:00.000Z"
}
```

```js
db.patients.createIndex({ orgId: 1, facilityId: 1, updatedAt: -1 });
db.patients.createIndex({ orgId: 1, careTeamId: 1, updatedAt: -1 });
db.patients.createIndex({ orgId: 1, _id: 1 }); // helps when using allowedPatientIds
```

**Access Control:**

- Scopes required: at minimum patients.read.

- Roles allowed (example): `clinician, dietitian, admin`.

- Row-level filter (MongoDB find):

- Always `orgId === user.orgId`

AND one of:

- facilityId user.facilityIds

- careTeamId user.careTeamIds

- \_id user.allowedPatientIds (as ObjectIds)

- If the user has no facility/team/grants, consider returning nothing (see “Hardening” note below).

**Retention**

- Keep operational records as long as clinically/contractually required.

- When a patient is deleted, purge or archive per /docs/security/data-retention.md and local policy.

**Notes**

- This collection deliberately excludes name, date of birth, address, contact details (those are in users_pii).

- Use projections in read routes to keep responses lean, e.g. { summary: 1, stage: 1, flags: 1, updatedAt: 1 }.

- Hardening (optional)

- If the user has no facilityIds, no careTeamIds, and no allowedPatientIds, return nothing:
