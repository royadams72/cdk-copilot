# patient_consents

**Purpose:** Track patient consent decisions for assignment-scoped care access at signup and when new clinicians or care teams are added later.
**Contains PII:** No direct PII. References patient, assignment, and clinician identifiers.
**Access:** App server only for writes. Patient may read and decide their own pending items through API routes. Staff/admin access should be audited.

## Fields (summary)

- `_id` · ObjectId · **Primary Key (PK)**
- `patientId` · ObjectId · required
- `principalId` · string · patient principal id for audit joins
- `assignmentId` · string · required · references `patients.assignments[].assignmentId`
- `orgId` · string · required
- `facilityId` · string · required
- `careTeamId` · string · required
- `clinicianPrincipalId` · string · optional · present when the consent is for a named clinician rather than team-only assignment
- `type` · enum (`signup_assignment|care_team_added|clinician_added`)
- `status` · enum (`pending|accepted|declined|superseded|revoked`)
- `decision` · enum (`agree|disagree|null`)
- `decisionSource` · enum (`signup|in_app|push_open|admin_reset|null`)
- `requestedAt` · Date · required
- `decidedAt` · Date · optional
- `copy` · object · prebuilt patient-facing content
  - `title` · string
  - `body` · string
- `createdAt` / `updatedAt` · Date
- `createdBy` / `updatedBy` · string ref: `principalId`

## Example

```json
{
  "_id": { "$oid": "6841b7e9c2ab4a0c9f3a1e99" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "principalId": "pr_demo_jane",
  "assignmentId": "asg_barts_renal_north_001",
  "orgId": "org_rf_london",
  "facilityId": "edgware_renal",
  "careTeamId": "ctm_northwest",
  "clinicianPrincipalId": "pr_clinician_123",
  "type": "clinician_added",
  "status": "pending",
  "decision": null,
  "decisionSource": null,
  "requestedAt": "2026-05-29T09:00:00.000Z",
  "decidedAt": null,
  "copy": {
    "title": "Care team update",
    "body": "A clinician has been added to your care team and needs your approval."
  },
  "createdBy": "pr_service_lead_1",
  "updatedBy": "pr_service_lead_1",
  "createdAt": "2026-05-29T09:00:00.000Z",
  "updatedAt": "2026-05-29T09:00:00.000Z"
}
```

## Behaviour

- Initial signup:
  - create patient assignment with `status="pending"` and `consentStatus="pending"`
  - create matching `patient_consents` row with `type="signup_assignment"`
  - block app flow until the patient agrees or disagrees

- Ad hoc care-team or clinician addition:
  - create a new `patient_consents` row
  - send push notification if available
  - show the same blocking in-app screen on open until a decision is made

- Decision effects:
  - `agree`:
    - mark consent row `accepted`
    - update the linked patient assignment to `consentStatus="accepted"`
    - activate the assignment or apply the new clinician/team relationship
  - `disagree`:
    - mark consent row `declined`
    - do not activate the new assignment or clinician/team addition
    - preserve other already-accepted assignments

## Indexes

```js
db.patient_consents.createIndex(
  { patientId: 1, status: 1, requestedAt: -1 },
  { name: "byPatientPending" },
);
db.patient_consents.createIndex(
  { patientId: 1, assignmentId: 1, clinicianPrincipalId: 1, status: 1 },
  { name: "byAssignmentDecision" },
);
db.patient_consents.createIndex(
  { assignmentId: 1, requestedAt: -1 },
  { name: "byAssignmentHistory" },
);
```

## Notes

- Keep only one active `pending` consent per exact `patientId + assignmentId + clinicianPrincipalId?` key.
- `patient_consents` stores decision history; `patients.assignments[]` stores current operational access state.
