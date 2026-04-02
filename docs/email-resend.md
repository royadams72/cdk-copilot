# Email And Resend

## Purpose

CKD Copilot uses [Resend](https://resend.com/)to send email links for patient sign-in and email verification.

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
- `EMAIL_FROM`
- `VERIFY_URL`
- `REDIRECT_URI`
- `APP_ORIGIN`

If `VERIFY_URL`, `REDIRECT_URI`, `EMAIL_FROM`, or `APP_ORIGIN` are missing, the route returns `missing_params: env`.

## Resend Behavior

Resend is initialized only when `RESEND_API_KEY` exists.

- With `RESEND_API_KEY`: the route sends real emails via `resend.emails.send(...)`
- Without `RESEND_API_KEY`: the route logs the generated sign-in or verification link to the server console instead

That makes local development possible without a live email provider.

## Email Content

For existing users, the route sends a sign-in email with a one-time link.

For new users, the route sends a verification email with a one-time link.

Both links currently expire after 30 minutes.

## Mobile Notes

After submitting an email, the app navigates to:

- [apps/mobile/src/screens/onboarding/CheckEmail.tsx](/Users/royadams/Sites/ckd-copilot/apps/mobile/src/screens/onboarding/CheckEmail.tsx)

If you are testing against a deployed API and not receiving mail:

1. Confirm `RESEND_API_KEY` is set in the API environment.
2. Confirm `EMAIL_FROM` is a sender/domain allowed by Resend.
3. Confirm `APP_ORIGIN`, `VERIFY_URL`, and `REDIRECT_URI` match the deployed flow.
4. Check API logs for either Resend errors or the dev fallback link logging.

## Current Caveat

There is no dedicated mailer abstraction yet. The signup-init route currently owns both token issuance decisions and direct Resend delivery.
