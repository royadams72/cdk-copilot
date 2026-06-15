# Pilot Setup And Future Model

**Source inputs:**

- `CKD Copilot Trust Onboarding and Access Process.docx`
- `Clinical and admin portal spec.docx`

## Pilot hierarchy

For the pilot, the working hierarchy is:

`Trust -> Facility -> Service -> Care Team -> Patients`

Example:

`Barts Health NHS Trust -> Newham University Hospital -> CKD Pilot Service -> CKD Pilot Care Team`

## Pilot roles

For the 3/6 month pilot, use only:

- `ckd_copilot_admin`
- `pilot_care_team_admin`
- `clinical_staff`
- `governance_reviewer`

Do not use `trust_lead` or `service_lead` in pilot workflows.

## Pilot responsibilities

### CKD Copilot Admin

- creates the trust, facility, service, and initial care team
- invites or provisions the initial pilot admin users
- should not routinely view patient data

### Pilot Care Team Admin

- adds or bulk imports patients
- invites clinical staff
- assigns staff to the pilot care team
- manages patient access duration for the pilot

### Clinical Staff

- can view and update patients assigned to their care team
- cannot add unrelated patients unless they also hold `pilot_care_team_admin`

### Governance Reviewer

- can review audit and access concerns
- does not manage day-to-day setup

## Pilot access rules

1. A patient can be added only by an approved `pilot_care_team_admin`.
2. Once added to the pilot care team, active clinical staff in that care team can access the patient.
3. All adds, imports, assignment changes, access grants, extensions, and exports must be audit logged.
4. Admin role alone does not grant patient visibility.

## Security model for implementation

Current code still uses `orgId` heavily. For portal planning:

- treat `trustId` as the user-facing concept
- keep `orgId` as the compatibility field name where existing collections still depend on it
- prefer new logic that reads active patient assignments rather than old flat org checks

Target access logic:

```ts
const sameTrust = patient.trustId === clinician.trustId;
const sharedCareTeam = clinician.careTeamIds.some((id) => patient.careTeamIds.includes(id));
const directAssignment = clinician.assignedPatientIds.includes(patient.id);

const canAccessPatient = sameTrust && (sharedCareTeam || directAssignment);
```

Implementation note:

- the old pattern `patient.orgId === clinician.orgId` is not sufficient for the portal
- patient access should resolve from assignments first, then any approved patient-specific grants

## Phase 2 direction

The docs also describe a fuller future model. Plan for it now, but do not build it into the pilot workflow yet.

Phase 2 roles:

- `trust_lead`
- `deputy_trust_lead`
- `service_lead`

Phase 2 additions:

- trust-level setup dashboard
- service/care-team approval flows
- cross-trust approval handling
- dual approval for external clinicians where required
- change history for site, service, and care-team naming

## Recommended engineering stance

- build the pilot role model as a constrained subset of the future model
- keep role and scope checks extensible so `trust_lead` and `service_lead` can be added later without rewriting patient access rules
- do not expose phase-2 UI paths in the pilot
