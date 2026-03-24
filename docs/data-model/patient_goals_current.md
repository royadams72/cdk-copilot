# patient_goals_current

**Purpose:** Current effective patient goal state. This is the source of truth for patient-selected goals, care-team overrides, and the goals used by weekly nutrition insights.

## Why this exists

- Patients can choose multiple goals during onboarding or later in the app.
- Care team members can override and lock specific goals.
- Weekly nutrition insights should read persisted effective goals, not request-body input.
- Major active goals are mirrored into `care_plans.goals` for clinician visibility and audit context.

## Shape

- `patientId` · ObjectId
- `orgId` · string|null
- `goals[]`
  - `code` · `weight_loss|weight_maintenance|weight_gain|reduce_phosphorus|reduce_potassium|reduce_sodium|increase_protein|improve_energy|better_meal_routine|general_health`
  - `domain` · `weight|nutrition|symptom|lifestyle|general`
  - `effectiveCode` · `overrideCode ?? code`
  - `label` · string
  - `lockedByCareTeam` · boolean
  - `notes` · string|null
  - `overrideCode` · enum|null
  - `overrideReason` · string|null
  - `overrideAt` · Date|null
  - `overrideBy` · actor|null
  - `priority` · int
  - `selectedAt` · Date
  - `selectedBy` · actor
  - `source` · `patient|clinician|dietitian|admin|system`
  - `status` · `active|inactive|completed|archived`
  - `updatedAt` · Date
- `createdAt` · Date
- `updatedAt` · Date
- `createdBy` · actor
- `updatedBy` · actor

Actor shape:

- `actorType` · `patient|clinician|dietitian|admin|system`
- `principalId` · string
- `displayName` · string|null

## Rules

- Multiple goals may be active at the same time.
- Lower `priority` means more important.
- `effectiveCode` is the goal the app should actually use.
- If `lockedByCareTeam` is true, the patient cannot change that goal directly.

## Weekly insight use

- Weekly nutrition insight generation reads active goals from this collection.
- The highest-priority active `effectiveCode` is currently used as the primary goal context.
- Numeric nutrition targets still come from `targets_current`.

## Care plan mirroring

- Active goals from `patient_goals_current` are mirrored into `care_plans.goals`.
- `care_plans` is not the source of truth for goal editing.
- The mirror exists so clinician-facing care plans reflect the patient’s active goal state and any care-team override.

## Routes

- `GET /api/patient-goals`
- `PATCH /api/patient-goals`
- `PATCH /api/patient-goals/override`
