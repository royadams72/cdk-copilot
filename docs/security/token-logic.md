# Token And Refresh Logic

## Overview

The session model uses:

- Access token: JWT (`HS256`), short-lived (`7d`), sent in `Authorization: Bearer <jwt>`.
- Refresh token: opaque `id.secret` token, long-lived (`30d`), stored server-side as a hashed secret in `AuthTokens` (`type: "refresh"`).

Access JWTs are validated on each protected API call. Refresh tokens are used only by `/api/users/refresh-token` to mint a new JWT and rotate refresh state.

## Issuance Flow

1. User completes auth exchange at `/api/auth/exchange`.
2. API issues:
   - `jwt` (claims include `sub` = credential ID, plus `principalId`, `orgId`, `scopes`).
   - `refreshToken` (opaque `id.secret` string).
3. API stores refresh token document in `AuthTokens`:
   - `id` (lookup key),
   - `secretHash` (HMAC hash of secret bytes),
   - identity context (`principalId`, `credentialId`, `patientId`, `sessionId`),
   - lifecycle fields (`expiresAt`, `usedAt`, `revokedAt`, `rotatedAt`, `replacedById`).

## Protected Route Flow

1. Client calls protected route with JWT.
2. `requireUser` verifies JWT via `jwtVerify(..., { algorithms: ["HS256"] })`.
3. If JWT is valid, request continues.
4. If JWT is expired/invalid, route returns `401` and client should call refresh endpoint.

## Refresh Flow

1. Client calls `POST /api/users/refresh-token` with `{ refreshToken }`.
2. API parses token (`id.secret`) and loads `AuthTokens` record by `id`.
3. API validates:
   - hash match (`secretHash` vs presented secret),
   - token not expired,
   - token not already `usedAt`,
   - token not `revokedAt`.
4. API loads active account and effective scopes.
5. API issues new `jwt` (`7d`) and new refresh token (`30d`).
6. API stores the new refresh token doc and marks old doc rotated:
   - old: `rotatedAt = now`, `replacedById = new._id`
   - new: active token for future refreshes
7. Client replaces local `ckd_jwt` and `ckd_refresh`.

## Rotated Token Recovery (Current Behavior)

To recover from stale mobile state (for example app crash during token update), refresh currently allows a token even when `rotatedAt` is already set, as long as it is still valid and not revoked/expired.

This is intentionally more permissive for reliability. If stricter replay protection is required, add a short grace window for rotated tokens.

## Common 401 Causes

- Missing refresh token in request body.
- Invalid token format (`id.secret` parse failed).
- Token not found.
- Token expired.
- Secret hash mismatch.
- Token revoked.
- Account inactive.
