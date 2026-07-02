# patients (Operational, Non-PII)

**Purpose:** Operational, non-PII view of patients for listings and dashboards. PII lives in `users_pii`; clinical details in `users_clinical`.
**Contains PII:** No
**Access:** App server for authorised staff (role + scope gated). Support staff via audited tooling.

## Fields (summary)

- `_id` · ObjectId · **Primary Key (PK)** (mapped to `patientId` across the system)
- `principalId` · string · unique · app-generated once at signup; use to log `updatedBy` and `createdBy`
- `scopes` · string[] · e.g. `["patients.read","patients.flags.write"]`
- `assignments` · object[] · required · the patient's care-access boundaries
  - `assignmentId` · string · stable identifier for this patient/org/facility/team relationship
  - `orgId` · string · owning organisation
  - `facilityId` · string · site/clinic identifier
  - `careTeamId` · string · team identifier
  - `status` · enum (`pending|active|inactive|ended`) · assignment lifecycle
  - `consentStatus` · enum (`pending|accepted|declined|revoked`) · latest patient decision for the assignment
  - `startsAt` · Date · optional
  - `endsAt` · Date · optional
  - `createdAt` / `updatedAt` · Date
- `summary` · object · lightweight UI summary (safe fields only)
  - `lastContactAt` · Date · optional
  - `dietitianAssigned` · boolean · optional
  - _(may include additional future keys)_
- `flags` · string[] · optional · tags like `["diet-support","exercise-plan"]`
- `createdAt` / `updatedAt` · Date (ISO 8601)

## Example

```json
{
  "_id": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "principalId": "pr_demo_jane",
  "assignments": [
    {
      "assignmentId": "asg_barts_renal_north_001",
      "orgId": "org_rf_london",
      "facilityId": "edgware_renal",
      "careTeamId": "ctm_northwest",
      "status": "active",
      "consentStatus": "accepted",
      "startsAt": "2025-07-12T10:00:00.000Z",
      "endsAt": null,
      "createdAt": "2025-07-12T10:00:00.000Z",
      "updatedAt": "2025-10-08T18:44:00.000Z"
    }
  ],
  "summary": {
    "lastContactAt": "2025-10-03T09:20:00.000Z",
    "dietitianAssigned": true
  },
  "stage": "3b",
  "flags": ["diet-support", "exercise-plan"],
  "createdAt": "2025-07-12T10:00:00.000Z",
  "updatedAt": "2025-10-08T18:44:00.000Z"
}
```

## Indexes

```js
db.patients.createIndex(
  {
    "assignments.orgId": 1,
    "assignments.facilityId": 1,
    "assignments.careTeamId": 1,
    "assignments.status": 1,
    updatedAt: -1,
  },
  { name: "byAssignmentAccess" },
);
db.patients.createIndex(
  {
    "assignments.assignmentId": 1,
  },
  { name: "byAssignmentId" },
);
db.patients.createIndex({ _id: 1, "assignments.status": 1 }, { name: "byPatientStatus" });
```

## Access Control

- Scopes required: at minimum `patients.read`.
- Roles allowed (example): `clinician, dietitian, admin`.
- Row-level filter (MongoDB find):

- `patientId ∈ user.allowedPatientIds`

OR

- patient has at least one assignment where:
  - `assignment.orgId === user.orgId`
  - `assignment.status === "active"`
  - and one of:
    - `assignment.facilityId ∈ user.facilityIds`
    - `assignment.careTeamId ∈ user.careTeamIds`

- If the user has no facility/team/grants, consider returning nothing.

## Consent Notes

- `assignments[]` is the operational source of truth for patient access boundaries.
- The detailed patient decision history should live in `patient_consents`.
- Initial signup no longer requires a separate assignment-consent gate.
- When a patient is added to a new care team or clinician relationship that requires approval, set the assignment to `pending`, set `consentStatus="pending"`, and create a matching `patient_consents` row.
- Patient acceptance activates the pending assignment or access change.
- The clinician-portal access rules for when to skip consent for in-team clinicians are tracked in `/docs/clinician-portal-consent-spec.md`.

## Retention

- Keep operational records as long as clinically/contractually required.
- When a patient is deleted, purge or archive per `/docs/security/data-retention.md` and local policy.

## Notes

- This collection deliberately excludes name, date of birth, address, contact details; those are in `users_pii`.
- Use projections in read routes to keep responses lean, e.g. `{ assignments: 1, summary: 1, stage: 1, flags: 1, updatedAt: 1 }`.
- Prefer treating old top-level `orgId`, `facilityId`, and `careTeamId` usage as deprecated. New code should read the active assignment instead.
