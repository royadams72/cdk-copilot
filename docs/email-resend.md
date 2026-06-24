# Email And Resend

## Purpose

CKD Copilot uses [Resend](https://resend.com/) to send email links for patient sign-in and email verification.

The main implementation lives in [apps/api/app/api/patients/signup-init/route.ts](/Users/royadams/Sites/ckd-copilot/apps/api/app/api/patients/signup-init/route.ts).

## Flow

The mobile app starts the flow from [apps/mobile/src/screens/onboarding/EmailSighup.tsx](/Users/royadams/Sites/ckd-copilot/apps/mobile/src/screens/onboarding/EmailSighup.tsx), which posts an email address to `POST /api/patients/signup-init`.

That API route decides between two paths:

- Existing identity: send a direct sign-in link
- New identity: send a verification link

The email links are backed by auth token documents and later consumed by:

- [apps/api/app/api/auth/verify/route.ts](/Users/royadams/Sites/ckd-copilot/apps/api/app/api/auth/verify/route.ts)
- [apps/api/app/api/auth/exchange/route.ts](/Users/royadams/Sites/ckd-copilot/apps/api/app/api/auth/exchange/route.ts)

## Required Environment Variables

The signup-init route expects these env vars:

- `RESEND_API_KEY`
- `VERIFY_URL`
- `REDIRECT_URI`
- `APP_ORIGIN`
- `EMAIL_FROM` for real email sending

If `VERIFY_URL`, `REDIRECT_URI`, or `APP_ORIGIN` are missing, the route returns `missing_params: env`.

## Resend Behavior

Resend is initialized only when `RESEND_API_KEY` exists.

- With `RESEND_API_KEY`: the route sends real emails via `resend.emails.send(...)`
- Without `RESEND_API_KEY`: the route falls back to a local dev link flow

For local development:

- the route returns `devLink` in the JSON response
- [apps/mobile/src/screens/onboarding/EmailSighup.tsx](/Users/royadams/Sites/ckd-copilot/apps/mobile/src/screens/onboarding/EmailSighup.tsx) opens that link directly
- if Resend is configured but fails locally, the route still falls back to `devLink`

This makes local development possible without relying on inbox delivery.

## Email Content

For existing users, the route sends a sign-in email with a one-time link.

For new users, the route sends a verification email with a one-time link.

Both links currently expire after 30 minutes.

## Mobile Notes

After submitting an email:

- deployed environments usually show the normal “check your email” path
- local environments can return `devLink`, which the app opens immediately

For the full local phone/release setup, see [docs/mobile-local-release-testing.md](/Users/royadams/Sites/ckd-copilot/docs/mobile-local-release-testing.md).

If you are testing against a deployed API and not receiving mail:

1. Confirm `RESEND_API_KEY` is set in the API environment.
2. Confirm `EMAIL_FROM` is a sender/domain allowed by Resend.
3. Confirm `APP_ORIGIN`, `VERIFY_URL`, and `REDIRECT_URI` match the deployed flow.
4. Check API logs for either Resend errors or the dev fallback link logging.

## Current Caveat

There is no dedicated mailer abstraction yet. The signup-init route currently owns both token issuance decisions and direct Resend delivery.
