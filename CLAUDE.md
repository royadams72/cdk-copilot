# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CKD Copilot is a health management app for patients with Chronic Kidney Disease. It consists of a React Native mobile app (Expo) and a Next.js backend API, sharing types and schemas through a local package.

## Monorepo structure

pnpm workspaces with Turbo:

- `apps/api` — Next.js 15 API server (deployed on Vercel), all backend logic
- `apps/mobile` — Expo/React Native app (Android primary, iOS secondary)
- `packages/core` — Shared Zod schemas, TypeScript types, MongoDB collection constants, scopes
- `packages/networking` — Minimal unauthenticated fetch wrapper

## Key commands

All run from repo root:

```bash
pnpm core:build                          # Build @ckd/core (required before mobile dev or API build)
pnpm api:dev                             # Start Next.js API on port 3000
pnpm mobile:dev                          # Start Expo Metro (dev-client, localhost)
pnpm build                               # Build core + API for production

# Android development (physical device via USB)
pnpm mobile:build:android:debug          # Build debug APK
pnpm mobile:install:android:debug        # Install debug APK and launch
pnpm mobile:reverse                      # ADB USB reverse (ports 3000, 8081, 19000, 19001)

# Database
pnpm db:apply-validators                 # Apply MongoDB JSON schema validators
```

**Critical:** `pnpm core:build` must be run before starting mobile Metro or building the API — Metro resolves `@ckd/core` from `packages/core/dist/`, not source.

## Environment variables

The API (`apps/api/next.config.mjs`) loads env from the **repo root** `.env.local`, not from `apps/api/.env.local`.

Mobile env vars (`EXPO_PUBLIC_*`) are baked in at Metro bundle time — changing them requires a Metro restart.

| Variable | Used by | Purpose |
|---|---|---|
| `MONGODB_URI_APP` | API | Primary app database |
| `MONGODB_URI_ANALYTICS_RO` | API | Read-only analytics DB |
| `EXPO_PUBLIC_API_URL` | Mobile | Override API target (defaults to localhost) |

For the mobile app to hit the deployed Vercel API during local dev, set `EXPO_PUBLIC_API_URL=https://cdk-copilot-api.vercel.app` in `apps/mobile/.env.local`.

## Architecture

### Request flow

```
Mobile (Expo Router) → authFetch / RTK Query → Next.js Route Handlers → MongoDB
```

Every API route calls `requireUser(req, neededScopes)` (`apps/api/lib/auth/auth_requireUser.ts`) which validates the JWT, resolves the `principalId` → `UsersAccount` → scopes chain, and returns a `SessionUser`. Patients must also have a linked `Patients` document or the request is rejected.

### API response envelope

All API responses follow `{ ok: boolean, data?: T, message?: string, errors?: unknown }`. The mobile RTK Query base query (`appApi.ts`) unwraps this envelope automatically, so RTK Query consumers receive `data` directly.

### Mobile state management

Redux Toolkit + RTK Query, persisted to `expo-secure-store`. The store (`apps/mobile/src/store/`) has:
- RTK Query services split by domain: `dashboardApi`, `logMealApi`, `measurementsApi`, `medicationApi`, `patientEngagementApi`, `patientGoalsApi`, `userApi` — all inject endpoints into a single `appApi` instance
- Redux slices: `dashboardSlice`, `logMealSlice`
- JWT stored in SecureStore under key `ckd_jwt`; `authFetch` and the RTK Query base query both auto-refresh on 401

### Mobile routing

Expo Router file-based routing. Route groups map to app states:

- `(init-app)/` — welcome/splash before auth
- `(auth)/` — magic-link login, onboarding forms (PII → clinical → labs → medications)
- `(tabs)/` — main tab shell once onboarded
- `(dashboard)/`, `(labs)/`, `(log-meal)/`, `(medications)/`, `(fitness)/`, `(nutrition)/` — feature stacks

Onboarding progress is tracked via `onboardingSteps` on the user's account. `resolveOnboardingRoute()` (`apps/mobile/src/lib/onboarding.ts`) determines which screen to land on.

### Data model (PII / Clinical split)

By design (ADR-0001), user data is split across two MongoDB collections to satisfy UK GDPR and enable pseudonymised analytics:

- `users_pii` — name, email, DOB, NHS number, contact details
- `users_clinical` — CKD stage, eGFR, clinical flags, dietary targets

They are linked by `principalId`. Analytics pipelines only ever receive `pseudonymId`. All clinical access is audited.

### Auth and RBAC

Roles: `patient`, `clinician`, `dietitian`, `admin`. Each role has a fixed set of scopes defined in `packages/core/src/isomorphic/constants/scopes.ts`. The `requireUser()` call takes a `neededScopes` argument — pass the minimum scopes required for that endpoint.

### @ckd/core package

Two export paths:

- `@ckd/core` — isomorphic: Zod schemas, TypeScript types, scopes, onboarding step constants. Safe to import in mobile and API.
- `@ckd/core/server` — server-only: MongoDB collection name constants (`COLLECTIONS`), repository helpers. Never import in mobile.

After editing schemas in `packages/core/src/`, run `pnpm core:build` before the changes are visible to consumers.

## Health Connect (Android)

The mobile app syncs steps (daily aggregates), heart rate, blood pressure, sleep, and exercise from Android Health Connect. Synced records are saved as `source: "provider"` with a deterministic `externalRecordId` to prevent duplicates.

Changing Health Connect permissions in `app.json` or `AndroidManifest.xml` requires a full native rebuild and reinstall of the dev client (`pnpm mobile:rebuild:android`).

After changing the measurements collection schema, apply Mongo validators before testing against Vercel:

```bash
pnpm db:apply-validators
```
