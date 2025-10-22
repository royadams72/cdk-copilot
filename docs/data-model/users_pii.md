# UserPII (Personally Identifiable Information)

**Purpose:** Authentication, contact, app preferences, and consent records.
**Contains PII (Personally Identifiable Information):** Yes
**Access:** App server and the user (self). Support staff have restricted read access.
**Analytics/Research:** Use `pseudonymId` instead of PII.

## Fields (summary)

- `patientId` · ObjectId (ref: patients)
- `email` · string · unique · example: `roy@example.com`
- `emailVerifiedAt` · Date|null
- `passwordHash` · string (when using password auth)
- `phoneE164` · string|null · E.164 format
- `firstName` / `lastName` · string
- `dateOfBirth` · Date|null
- `sexAtBirth` · enum (`female|male|intersex|unknown`)
- `genderIdentity` · string|null
- `ethnicity` · string|null (opt‑in, with purpose explained)
- `country` · string (ISO 3166‑1 alpha‑2)
- `timeZone` · string (IANA timezone)
- `units` · enum (`metric|imperial`)
- `language` · string (e.g. `en-GB`)
- `onboardingCompleted` · boolean
- `onboardingSteps` · string\[]
- `notificationPrefs` · { email, push, sms }
- `integrations` · Apple Health / Google Fit / Withings link state
- `devices` · array of { platform, pushToken?, lastSeenAt? }
- `consentAppTosAt` · Date
  **(TOS = Terms of Service)**
- `consentPrivacyAt` · Date
- `consentResearchAt` · Date|null (explicit opt‑in)
- `pseudonymId` · string (for analytics/research only)
- `dataSharingScope` · enum (`minimal|standard|broad`)
- `status` · enum (`active|suspended|deleted`)
- `createdAt` / `updatedAt` / `lastActiveAt`

## Relations

- `UserClinical.userId` → `UserPII.id` (**Foreign Key (FK)**)

## Retention

- Active accounts: retained.
- After account deletion: purge PII within 30 days (backups per policy in `/docs/security/data-retention.md`).
