# users_staff (Staff Profile)

**Purpose:** Staff-facing identity profile used to display clinician and operational staff names consistently across the portal and audit-style UI.
**Contains PII:** Yes, limited staff identity data.
**Access:** App server only. Staff-admin read/write via audited tooling and privileged portal flows.

`users_staff` extends `users_accounts` in the same way that `users_pii` extends patient access/auth records:
- `users_accounts` answers **who the account is and what it can access**
- `users_staff` answers **how that staff member should be represented in workflows and UI**

## Fields (summary)

- `_id` · ObjectId · **PK**
- `principalId` · string · unique within the collection · joins to `users_accounts.principalId`
- `orgId` · string · organisation identifier for the staff profile
- `title` · string? · example: `Dr`, `Mrs`, `Ms`, `Professor`
- `firstName` · string
- `lastName` · string
- `jobTitle` · string? · example: `Consultant Nephrologist`, `Renal Dietitian`
- `displayName` · string? · optional canonical UI label, e.g. `Dr Jane Smith`
- `isActive` · boolean
- `createdAt` / `updatedAt` · Date (ISO 8601)
- `createdBy` / `updatedBy` · string ref: `principalId` from `users_accounts`

## Example document

```json
{
  "_id": { "$oid": "68514d6d6b497e1f2356b2c1" },
  "principalId": "pr_staff_demo_001",
  "orgId": "org_demo",
  "title": "Dr",
  "firstName": "Aisha",
  "lastName": "Rahman",
  "jobTitle": "Consultant Nephrologist",
  "displayName": "Dr Aisha Rahman",
  "isActive": true,
  "createdAt": "2026-06-01T09:00:00.000Z",
  "updatedAt": "2026-06-16T14:30:00.000Z",
  "createdBy": "pr_portal_demo_admin",
  "updatedBy": "pr_portal_demo_admin"
}
```

## Relations

- Joins to `users_accounts` by `principalId`
- Used by workflow/audit-style documents such as:
  - `care_plans.createdBy`
  - `care_plans.updatedBy`
  - future medication, notes, review, and task ownership displays

## Display rules

Recommended UI resolution order:
1. `displayName`
2. `title + firstName + lastName`
3. `firstName + lastName`
4. fallback to prettified `principalId`

This keeps operational documents storing stable actor ids (`principalId`) while the UI resolves a human-friendly display label from `users_staff`.

## Indexes

```js
db.users_staff.createIndex({ principalId: 1 }, { unique: true });
db.users_staff.createIndex({ orgId: 1, isActive: 1 });
db.users_staff.createIndex({ orgId: 1, lastName: 1, firstName: 1 });
```

## Privacy & retention

- Keep while the staff account remains active.
- Deactivate via `isActive = false` rather than deleting immediately.
- Remove or anonymise after offboarding according to organisational retention policy.
