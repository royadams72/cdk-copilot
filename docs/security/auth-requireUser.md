# `requireUser` Auth Guard Logic

Source: `apps/api/lib/auth/auth_requireUser.ts`

## Purpose

`requireUser(req, neededScopes?, opts?)` is the main API guard for protected routes.
It authenticates the caller from JWT, resolves identity and account context, computes effective scopes, and enforces required scopes.

## Inputs

- `req`: Next.js `NextRequest`.
- `neededScopes`: a `Scope` or `Scope[]` required by the route (optional).
- `opts.allowBootstrap`: optional bootstrap mode for limited no-JWT flows.

## JWT Path (Primary)

1. Reads bearer token from `Authorization: Bearer <token>`.
2. Verifies JWT with `HS256` and `JWT_SECRET`.
3. Uses `sub` claim as `credentialId`.
4. Resolves active auth link from `AuthLinks` (`credentialId`, `active: true`):
   - gets `provider` and `principalId`.
5. Resolves active account from `UsersAccounts` (`principalId`, `isActive: true`).
6. Builds effective scopes:
   - role defaults from `ROLE_SCOPES[role]`,
   - plus account `scopes` and `grants`,
   - de-duplicated.
7. Enforces `neededScopes` via `hasScopes(...)`.
8. If role is `patient`, resolves `patientId` from `Patients` by `principalId`.
9. Returns `SessionUser`:
   - `authId`, `provider`, `principalId`, `role`,
   - org/facility/team/patient context,
   - `allowedPatientIds`,
   - effective `scopes`.

## Bootstrap Path (Secondary)

If no JWT is present, `requireUser` can return a provisional bootstrap user only when:

- `opts.allowBootstrap` is true, and
- requested scopes include `DEFAULT_SCOPES` check used by current code.

Returned bootstrap session:

- `authId: "bootstrap"`
- `provider: "magic"`
- `principalId: "provisional"`
- `role: "patient"`
- `scopes: DEFAULT_SCOPES`

## Failure Outcomes

`requireUser` throws typed errors with HTTP status mapping:

- `401 Unauthorized`:
  - missing/invalid/expired JWT,
  - missing credential subject (`sub`),
  - no valid auth context.
- `403 Forbidden`:
  - auth link missing/inactive,
  - account missing/inactive,
  - patient context missing,
  - scope check failed.

Routes usually catch and map `error.status` into API response status.
