# Token And Refresh Logic

## Overview

The session model uses:

- Access token: JWT (`HS256`), short-lived (`7d`), sent in `Authorization: Bearer <jwt>`.
- Refresh token: opaque `id.secret` token, long-lived (`30d`), stored server-side as a hashed secret in `AuthTokens` (`type: "refresh"`).

`JWT_SECRET` is required. Auth token issuance and verification must fail fast if it is missing or empty.

Access JWTs are validated on each protected API call. Refresh tokens are used only by `/api/users/refresh-token` to mint a new JWT and rotate refresh state.

## Issuance Flow

1. User completes auth exchange at `/api/auth/exchange`.
2. API issues:
   - `jwt` (claims include `sub` = credential ID, plus `principalId`, `orgId`, `scopes`).
   - `refreshToken` (opaque `id.secret` string).
3. Before storing the new refresh token, the API revokes any older still-active refresh tokens for the same `principalId + credentialId`.
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

## Cleanup Strategy

- `auth_tokens.expiresAt` has a TTL index (`expireAfterSeconds: 0`) so expired auth tokens are deleted automatically by MongoDB.
- TTL cleanup is asynchronous, so recently expired rows may still be visible for a short period.
- Active refresh-token duplication is handled separately:
  - new sign-in exchange revokes older still-active refresh tokens for the same credential
  - `pnpm db:cleanup:auth-tokens` can revoke duplicate active refresh rows already present in the database

## Rotated Token Reuse

Rotated refresh tokens are rejected.

If a client presents a refresh token whose document already has `rotatedAt` set, the API treats that as replay or stale-token reuse:

- the request is rejected with `401`
- the refresh-token session family is revoked via `sessionId` when available

This preserves the core security property of rotation: once token `A` has been exchanged for token `B`, token `A` must no longer be able to mint new sessions.

## Common 401 Causes

- Missing refresh token in request body.
- Invalid token format (`id.secret` parse failed).
- Token not found.
- Token expired.
- Secret hash mismatch.
- Token revoked.
- Account inactive.
