# health_profiles_current

**Purpose:** Current effective structured health profile state for the patient. This is the fast-read projection for structured allergies, dietary preferences, and terminology-backed conditions.

## Why this exists

- The app needs a single current document to load and edit the patient’s health profile efficiently.
- `health_profiles_ledger` should remain append-only for audit and correction history.
- UI screens should read current effective state rather than replay ledger history on every request.

## Shape

- `patientId` · ObjectId
- `orgId` · string|null
- `allergies[]`
  - `entryId` · string
  - `value.kind` · `"allergy"`
  - `value.allergy.group` · `food|medication|environmental|latex|other`
  - `value.allergy.label` · string
  - `value.allergy.key` · string|null
  - `value.allergy.childKey` · string|null
  - `value.allergy.childLabel` · string|null
  - `value.allergy.severity` · `mild|moderate|severe|unknown`
  - `value.allergy.notes` · string|null
  - `value.allergy.medicationCode` · string|null
  - `value.allergy.medicationCodeSystem` · `DM_D|SNOMED_CT|CUSTOM|null`
  - `value.allergy.medicationRefId` · ObjectId|null
  - `value.allergy.dmplusdCode` · string|null
  - `value.allergy.snomedCode` · string|null
- `dietaryPreferences[]`
  - `entryId` · string
  - `value.kind` · `"dietary_preference"`
  - `value.dietaryPreference.key` · enum
  - `value.dietaryPreference.label` · string
- `conditions[]`
  - `entryId` · string
  - `value.kind` · `"condition"`
  - `value.condition.code` · string
  - `value.condition.codeSystem` · `SNOMED_CT|CUSTOM`
  - `value.condition.label` · string
  - `value.condition.status` · `active|inactive|resolved|unknown`
  - `value.condition.notes` · string|null
- `createdAt` · Date
- `updatedAt` · Date
- `createdBy` · actor
- `updatedBy` · actor

Actor shape:

- `actorType` · `patient|clinician|dietitian|admin|system`
- `principalId` · string
- `displayName` · string|null

## Rules

- One `health_profiles_current` document per patient.
- `entryId` is the stable logical identifier for a profile item across edits.
- Arrays contain only active current values.
- Deletions are represented by removing the item from this collection and recording a `removed` event in `health_profiles_ledger`.

## Source of truth relationship

- `health_profiles_ledger` is the audit history source.
- `health_profiles_current` is the read-optimized projection.
- If a discrepancy is ever found, the ledger should be treated as the canonical history and the current projection should be rebuilt from it.

## Routes

- `GET /api/health-profiles`
- `POST /api/health-profiles`
