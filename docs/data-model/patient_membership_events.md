# patient_membership_events

**Purpose:** Audit trail for clinician-managed membership changes after a patient invite has already been activated.

**Contains PII:** Indirectly, through `patientId`

## Core fields

- `patientId` · ObjectId of the patient record
- `assignmentId` · assignment row being changed
- `action` · `extended | suspended | ended | reactivated`
- `previousStatus` / `nextStatus`
- `previousEndsAt` / `nextEndsAt`
- `actorPrincipalId` / `actorRole` · who made the change
- `orgId` / `facilityId` / `careTeamId`
- `note` · required short reason entered in the portal
- `createdAt`

## Notes

- This collection is for post-activation membership control, not invite issuance.
- Invite lifecycle remains in `patient_invites`.
- Membership state still lives on the patient assignment; this collection is the audit log of changes to that state.
