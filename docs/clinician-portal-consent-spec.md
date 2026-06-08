# Clinician Portal Consent And Notification Spec

**Status:** Pending implementation
**When to implement:** During clinician portal build
**Scope:** Patient access changes initiated by clinician/admin workflows

## Goal

When clinician-portal users change patient access boundaries, the system must decide whether to:

- grant access immediately
- create a pending consent request
- notify the patient

This spec exists so the access-change rules are implemented consistently when the clinician portal is built.

## Rules

### 1. New care team added to a patient

If a patient is added to a care team they are not currently assigned to:

- create or update the relevant `patients.assignments[]` entry
- set `status="pending"`
- set `consentStatus="pending"`
- create a `patient_consents` row with `type="care_team_added"`
- notify the patient if push notifications are enabled and a device token exists
- surface the consent when the patient opens the download link or the app

### 2. Clinician added inside an existing assigned care team

If a clinician is added to a care team that the patient is already assigned to:

- do **not** create a `patient_consents` row
- do **not** notify the patient
- grant clinician access through the existing team boundary

Rationale:
- the patient already consented to that care-team boundary
- adding a clinician within that same boundary should not create extra friction

### 3. Clinician added outside the patient's existing care-team boundary

If a clinician is granted patient access and that clinician is **not** acting within one of the patient's already-assigned care teams:

- create or update the relevant `patients.assignments[]` entry
- set `status="pending"`
- set `consentStatus="pending"`
- create a `patient_consents` row with `type="clinician_added"`
- notify the patient if push notifications are enabled and a device token exists
- block access until the patient accepts

## Required checks in the clinician portal backend

When a clinician/admin attempts to grant access, the backend must determine:

1. the patient's current active assignments
2. whether the requested access is inside an existing assigned `careTeamId`
3. whether the requested clinician is being granted access through an existing assigned team or through a new/outside boundary

Suggested decision logic:

```ts
if (requestedCareTeamId is not currently assigned to patient) {
  queue care_team_added consent
} else if (clinician belongs to requestedCareTeamId) {
  grant access immediately
} else {
  queue clinician_added consent
}
```

## Existing code to reuse

Current reusable pieces already exist:

- pending-consent data model: `docs/data-model/patient_consents.md`
- assignment model: `docs/data-model/patients.md`
- patient consent fetch route:
  `apps/api/app/api/patient-consents/pending/route.ts`
- patient consent decision route:
  `apps/api/app/api/patient-consents/[consentId]/decide/route.ts`
- mobile consent gate:
  `apps/mobile/src/screens/onboarding/ConsentGate.tsx`
- helper for assignment-state summary:
  `apps/api/lib/utils/patientAssignments.ts`
- helper for creating pending care-team/clinician consent records:
  `apps/api/lib/utils/patientConsents.ts`
- push notification sender:
  `apps/api/lib/utils/pushNotifications.ts`

## Clinician portal implementation tasks

### Backend

- add or update the clinician-portal access-grant route/service
- load the patient's current assignments before granting access
- load the target care team and verify whether the clinician belongs to it
- call `queueCareTeamConsent(...)` only when rules 1 or 3 apply
- add push notification dispatch after consent creation
- avoid duplicate pending consents for the same patient + assignment + clinician key

### Data integrity

- keep only one active pending consent for the same exact access request
- do not create `clinician_added` consent when the clinician is inside an already-assigned care team
- preserve existing accepted assignments when a new outside-boundary request is declined

### Audit

- record the acting clinician/admin principal id as `createdBy` / `updatedBy`
- audit when access was granted immediately vs sent for consent

## Suggested push notification copy

### New care team

- title: `Care team access request`
- body: `A new care team has requested access to your CKD Copilot care record.`

### Outside-boundary clinician

- title: `Care team update`
- body: `A clinician outside your current care team needs your approval.`

## Open implementation note

At the time this spec was written, the repository does **not** yet contain the clinician-portal route that grants patient access. The rules above should be applied at that write path when it is created.
