# users_accounts (Authorisation Profile)

**Purpose:** Authentication/authorisation (AuthN/AuthZ) profile used by the API to decide **who the caller is** and **what they can access** (roles, scopes, org/team membership).
**Contains PII (Personally Identifiable Information):** No
**Access:** App server only. Support staff read access via audited tooling (least privilege).

## Fields (summary)

- `_id` · ObjectId · **Primary Key (PK)**
- `principalId` · string · unique · App generated once at signup - use to log `updatedBy` - `createdBy`
- `email` · string · unique · example: `roy@example.com`
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
- `createdBy` / `updatedBy` · string ref: `principalId` from patients or users_accounts

## Example document

```json
{
  "_id": { "$oid": "66f1b6809e3f48ad93d8b3c1" },
  "orgId": "org_rf_london",
  "role": "clinician",
  "scopes": ["patients.read", "patients.flags.write"],
  "facilityIds": ["edgware_renal"],
  "careTeamIds": ["ctm_northwest"],
  "principalId": "acc_mock_001",
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
db.users_accounts.createIndex({ principalId: 1 }, { unique: true });

// Common queries
db.users_accounts.createIndex({ orgId: 1, role: 1 });
db.users_accounts.createIndex({ orgId: 1, isActive: 1 });

// Membership lookups (multikey)
db.users_accounts.createIndex(
  { orgId: 1, facilityIds: 1 },
  { name: "byOrgFacility" }
);
db.users_accounts.createIndex(
  { orgId: 1, careTeamIds: 1 },
  { name: "byOrgCareTeam" }
);

// Explicit patient grants
db.users_accounts.createIndex(
  { allowedPatientIds: 1 },
  { name: "byAllowedPatient" }
);
```

## Privacy & retention

- Keep while active; deactivate via `isActive`=false.

- Remove or anonymise records 12 months after user deletion, per policy in `/docs/security/data-retention.md`.
