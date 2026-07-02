# patient_invites

**Purpose:** Holds pre-activation patient invitations created from the clinician portal. This is the invite record, activation-code record, and audit trail for who issued access.

**Contains PII:** Yes

## Core fields

- `patientId` · ObjectId string reserved for the eventual patient record
- `principalId` · principal reserved for the eventual patient account
- `orgId` / `facilityId` / `careTeamId` · assignment context to apply on activation
- `firstName` / `lastName` / `email` / `dateOfBirth` / `nhsNumber?`
- `durationMonths` · enum `3 | 6 | 12`
- `status` · `pending_review | invited | activated | expired | revoked | cancelled`
- `activationCodeHash` · SHA-256 hash of the activation code
- `activationCodeMasked` · last visible characters for support/audit
- `activationExpiresAt` · invite code expiry, currently 7 days from invite creation
- `invitedAt` · when the invite email was sent
- `activatedAt` · when the patient first redeemed the code
- `createdBy` / `updatedBy` · clinician principal responsible for the invite

## Activation behavior

- Invite creation does **not** start membership.
- Membership starts when the patient redeems the activation code in the app.
- On activation the backend:
  - provisions `patients`, `users_pii`, and `users_accounts` if missing
  - copies invite PII such as `firstName`, `lastName`, `dateOfBirth`, and `nhsNumber` into `users_pii`
  - creates or updates the initial patient assignment
  - sets assignment `startsAt` to activation time
  - sets assignment `endsAt` from `durationMonths`
  - marks the invite `activated`
  - mints a one-time oauth exchange token for the mobile app

## Notes

- `auth_credentials` is not used for activation codes. That collection is reserved for password and MFA secret state.
- Activation codes are one-time use. After activation, the patient should use the normal app sign-in flow.
