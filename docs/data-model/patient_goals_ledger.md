# patient_goals_ledger

**Purpose:** Audit history of patient goal changes.

## Shape

- `patientId` · ObjectId
- `orgId` · string|null
- `goalCode` · goal enum
- `eventType`
  - `patient_selected`
  - `patient_deselected`
  - `care_team_added`
  - `care_team_updated`
  - `care_team_override_set`
  - `care_team_override_cleared`
  - `care_team_lock_set`
  - `care_team_lock_cleared`
  - `goal_completed`
  - `goal_archived`
- `before` · prior goal snapshot|null
- `after` · new goal snapshot|null
- `reason` · string|null
- `createdAt` · Date
- `createdBy` · actor

## Purpose in the flow

- Record all patient checkbox changes
- Record clinician or dietitian overrides
- Support audit and retrospective review
- Keep parity with the existing `*_current` / `*_ledger` collection pattern used elsewhere
