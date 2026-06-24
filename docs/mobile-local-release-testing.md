# Mobile Local Release Testing

This flow is for testing the Android release app against a local API on a real device while keeping production env files clean.

## Mobile Env Files

Keep production in:

- [apps/mobile/.env.production](/Users/royadams/Sites/ckd-copilot/apps/mobile/.env.production)

Use a separate local release file:

- [apps/mobile/.env.local-release](/Users/royadams/Sites/ckd-copilot/apps/mobile/.env.local-release)

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.233:3001
```

## Start The API For LAN Access

Run the API on all interfaces:

```bash
cd /Users/royadams/Sites/ckd-copilot/apps/api
npx next dev -H 0.0.0.0 -p 3001
```

The phone and Mac must be on the same Wi‑Fi network.

## Build And Install The Android Release

Use:

```bash
pnpm mobile:build:android:release:local-http
pnpm mobile:install:android:release
```

Before reinstalling, uninstall the app from the phone or clear app storage so stale auth tokens do not carry across environments.

## Local Auth Behavior

Patient sign-in starts at:

- [apps/mobile/src/screens/onboarding/EmailSighup.tsx](/Users/royadams/Sites/ckd-copilot/apps/mobile/src/screens/onboarding/EmailSighup.tsx)

The API route is:

- [apps/api/app/api/patients/signup-init/route.ts](/Users/royadams/Sites/ckd-copilot/apps/api/app/api/patients/signup-init/route.ts)

Local behavior:

- if Resend works, the API still returns a local `devLink`
- if Resend fails or is not configured, the API returns the same `devLink`
- the app opens that link directly instead of waiting for an email

This avoids local testing depending on real inbox delivery.

## Local Auth Env Requirements

These still matter in local dev:

- `VERIFY_URL`
- `REDIRECT_URI`
- `APP_ORIGIN`

Even though local auth links are built from the incoming request host when possible, the route still expects the core auth envs to exist.

Typical root [.env.local](/Users/royadams/Sites/ckd-copilot/.env.local):

```env
VERIFY_URL=/api/auth/verify
REDIRECT_URI=ckdapp://verify
APP_ORIGIN=http://localhost:3000
```

The local patient auth route now prefers the incoming request host over `APP_ORIGIN` for local mobile flows, so a phone request to `http://192.168.1.233:3001` generates a usable auth link for that same LAN host.

## Quick Checks

From the phone browser:

- `http://192.168.1.233:3001/api/portal/session`

If that opens, LAN reachability is working.

If the app still shows `Network error`:

1. confirm the installed APK was rebuilt after any manifest or env change
2. confirm the API server was restarted after route/env changes
3. confirm the phone can still open the API URL in the browser
4. confirm the app was uninstalled or its data cleared before reinstall
