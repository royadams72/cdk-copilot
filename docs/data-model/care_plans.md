# care_plans

**Purpose:** Assign goals/tasks to a patient (diet/exercise/monitoring). Created by staff, visible to patient.
**Contains PII:** No (references only)
**Access:** Staff with `careplans.write` to create/update; `careplans.read` for viewing. Patients can read their own plans.

## Fields (summary)

- `_id` · ObjectId · **PK**
- `orgId` · string
- `patientId` · ObjectId (ref: patients)
- `ownerUserId` · string (ref: users_accounts.authId) · the clinician/dietitian responsible
- `title` · string
- `goals` · array of { `key` string, `label` string, `target?` object }
- `tasks` · array of { `key` string, `label` string, `freq` enum (`daily|weekly|once`), `dueRule?` string (RRULE), `instructions?` string, `status` enum (`open|paused|done`) }
- `status` · enum (`draft|active|completed|archived`)
- `sources` · array of (`manual|ai|template`)
- `notes` · string? (non-PII operational notes)
- `createdAt` / `updatedAt` · Date
- `activatedAt?` / `completedAt?` · Date

## Access Control

- Scopes: `careplans.read`, `careplans.write`
- Row scope: `orgId === user.orgId` AND (facility/team membership OR patient in `allowedPatientIds`), same as patients.

## Indexes

```js
db.care_plans.createIndex({ orgId: 1, patientId: 1, status: 1 });
db.care_plans.createIndex({ ownerUserId: 1, status: 1 });
```

## Retention

- Keep while the patient record is retained. Archive by `status`=archived.
