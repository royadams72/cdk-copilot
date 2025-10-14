# RBAC (Role‑Based Access Control)

**Goal:** ensure least‑privilege access to PII and Clinical data.

## Roles

- `end_user` — access to own PII and Clinical.
- `support` — limited PII read (email, status) for troubleshooting.
- `clinician` — read/write Clinical for assigned patients only.
- `research_export` — no direct DB access; uses curated exports with `pseudonymId` only.
- `admin` — full access (use sparingly, audit all).

## Matrix

| Role            | PII read | PII write | Clinical read  | Clinical write |
| --------------- | -------- | --------- | -------------- | -------------- |
| end_user        | Own      | Own       | Own            | Own            |
| support         | Limited  | ✖         | ✖              | ✖              |
| clinician       | ✖        | ✖         | Assigned       | Assigned       |
| research_export | ✖        | ✖         | ✔ via pipeline | ✖              |
| admin           | ✔        | ✔         | ✔              | ✔              |

## Enforcement layers

1. **API layer** (Next.js): check **JWT (JSON Web Token)** claims on each request.
2. **Service layer:** gate sensitive functions for Clinical reads/writes.
3. **Database layer:**
   - MongoDB: split collections and use different database users/roles.
4. **Auditing:** log who/when/which record; never log payloads.

---
