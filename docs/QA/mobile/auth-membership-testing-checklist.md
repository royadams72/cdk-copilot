# Mobile Authentication and Membership Testing Checklist

Use this after rebuilding the app and restarting the API.

## Activation and sign-in

1. Activate with a valid code.
   Expect:
   - code is accepted
   - the user can continue into onboarding
   - invite status becomes `Activated`
   - membership status becomes `Active`

2. Reuse the same activation code.
   Expect:
   - API rejects it
   - app shows a clear invalid/used-code message

3. Sign in with a valid patient email after activation.
   Expect:
   - email request succeeds
   - sign-in link or code works
   - app restores the patient session

## Session restore

1. Cold open with a valid active session.
   Expect:
   - bootstrap restores session
   - app opens to the correct authenticated route
   - no unnecessary sign-in prompt appears

2. Expired JWT with valid refresh token.
   Expect:
   - refresh token flow succeeds
   - app recovers without forcing sign-in

3. Missing or invalid refresh token.
   Expect:
   - app returns to sign-in/welcome
   - protected screens are not shown

## Membership end / lockout

1. End membership while the patient is signed in and using the app.
   Expect:
   - the next authenticated API call returns `membership_inactive`
   - local session is cleared
   - app redirects to `Access no longer active`
   - protected screens are no longer reachable

2. End membership before opening the app.
   Expect:
   - bootstrap restore detects inactive membership
   - app opens directly to `Access no longer active`

3. After lockout, try moving around the app.
   Expect:
   - protected routes stay blocked
   - Android back button does not reopen authenticated screens
   - repeated dashboard/history polling stops

4. Log verification during lockout.
   Expect:
   - no repeated protected API spam after the inactive flag is set
   - no continuing foreground sync loop for measurements/steps

## Reactivation

1. Reactivate a previously ended member.
   Expect:
   - patient can sign in again
   - bootstrap/session restore works normally again
   - `Access no longer active` no longer appears once a fresh authenticated session is established

## Push and background behavior

1. End membership while background sync had previously been enabled.
   Expect:
   - local auth mirror is cleared
   - scheduled native sync work is cancelled
   - the app does not keep attempting authenticated background sync against protected endpoints
