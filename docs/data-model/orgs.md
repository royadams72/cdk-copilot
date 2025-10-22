# CareTeams

**Purpose:** Tenant/org records (trusts, clinics, companies) that own facilities, users, and patients.
**Contains PII:** No direct PII.
**Access:**

- Read: platform admins; org admins; services with orgs:read.
- Write: platform admins; services with orgs:write.
- Audit: All writes logged.

## Fields (summary)

- `slug` (string, required, unique) – URL-safe key
- `name` (string, required)
- `status` (“active” | “suspended”, required)
- `createdAt` / `updatedAt` (date, required)

## Indexes

```js
[
  { key: { slug: 1 }, options: { unique: true } },
  { key: { name: 1 } },
  { key: { status: 1, updatedAt: -1 } },
];
```

## Common queries

```js
// Lookup by slug (login/tenant routing)
db.orgs.findOne({ slug });

// Show suspended orgs by most recent change
db.orgs.find({ status: "suspended" }).sort({ updatedAt: -1 });
```
