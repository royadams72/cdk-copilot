# users_accounts (Authorisation Profile)

**Purpose:** Authentication/authorisation (AuthN/AuthZ) profile used by the API to decide **who the caller is** and **what they can access** (roles, scopes, org/team membership).
**Contains PII (Personally Identifiable Information):** No
**Access:** App server only. Support staff read access via audited tooling (least privilege).

## Fields (summary)

- `_id` · ObjectId · **Primary Key (PK)**
- `authId` · string · unique · from Identity Provider (IdP) / JSON Web Token (JWT) subject (e.g., `cognito|abc123`)
- `orgId` · string · organisation identifier (NHS Trust / provider)
- `role` · enum (`patient|clinician|dietitian|admin`)
- `scopes` · string[] · e.g. `["patients.read","patients.flags.write"]`
- `facilityIds` · string[] · optional · site/clinic identifiers
- `careTeamIds` · string[] · optional · team identifier

- `allowedPatientIds` · string[] · optional · patient `_id` hex strings for explicit per-patient grants
- Most access is handled by membership: same orgId and (facility OR care team). Sometimes you need one-off access:
- Covering a colleague’s caseload this weekend
- MDT (Multidisciplinary Team) review of a few specific patients
- Temporary research cohort
- Patient gave explicit consent to a named clinician

- `isActive` · boolean
- `createdAt` / `updatedAt` · Date (ISO 8601)

## Example document

```json
{
  "_id": { "$oid": "66f1b6809e3f48ad93d8b3c1" },
  "authId": "cognito|abc123",
  "orgId": "org_rf_london",
  "role": "clinician",
  "scopes": ["patients.read", "patients.flags.write"],
  "facilityIds": ["edgware_renal"],
  "careTeamIds": ["ctm_northwest"],
  "allowedPatientIds": ["66f1b7e9c2ab4a0c9f3a1e21"],
  "isActive": true,
  "createdAt": "2025-07-01T09:00:00.000Z",
  "updatedAt": "2025-10-08T15:10:00.000Z"
}
```

**Relations:** Resolves access to documents in patients, users_clinical, and users_pii via:

- `orgId` (must match),
- `facilityIds/careTeamIds` (membership),
- `allowedPatientIds` (explicit grants)

## Indexes

```js
db.users_accounts.createIndex({ authId: 1 }, { unique: true });
db.users_accounts.createIndex({ authId: 1, isActive: 1 });
db.users_accounts.createIndex({ orgId: 1, role: 1 });
```

## Privacy & retention

- Keep while active; deactivate via `isActive`=false.

- Remove or anonymise records 12 months after user deletion, per policy in `/docs/security/data-retention.md`.
