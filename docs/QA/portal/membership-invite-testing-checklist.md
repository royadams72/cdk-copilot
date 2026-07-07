## Membership and Invite Testing Checklist

Use one patient invite per scenario where possible so state changes are easy to follow in Mongo and the portal.

### Invite flow

1. Create a new patient invite.
   Expect:
   - invite appears in `/portal/patients/invites`
   - status is `Pending send` or `Invited` depending on action used
   - care team and facility labels are correct
   - activation expiry is shown

2. Resend an invite.
   Expect:
   - status becomes `Invited`
   - expiry moves forward by 7 days
   - modal/feedback shows the fresh code when returned
   - updated timestamp changes

3. Extend an invite.
   Expect:
   - expiry moves forward by 7 days
   - `Pending send` stays pending if it was not sent yet
   - `Expired` becomes `Invited`

4. Revoke an invite.
   Expect:
   - status becomes `Revoked`
   - resend, extend, and revoke buttons are disabled afterward

5. Expired invite.
   Expect:
   - expired invite still appears in invites list
   - status filter `Expired` finds it
   - resend/extend are still available

6. Download/import template.
   Expect:
   - `Download template` returns a CSV with the required headers
   - `Import CSV` hydrates the row grid from the file
   - imported rows still go through normal validation and review before invite creation

### Activation flow

1. Activate from the app with a valid code.
   Expect:
   - invite status becomes `Activated`
   - invite row now also shows downstream membership status
   - access end date is shown on the invite row

2. Reuse the same code.
   Expect:
   - API rejects it as already used

3. Try an expired code.
   Expect:
   - API rejects it as expired
   - invite status remains or becomes `Expired`

### Membership lifecycle

1. Newly activated membership.
   Expect:
   - patient appears in main patient list
   - membership shows `Active`
   - membership page shows current assignment, end date, and history

2. Ending soon.
   Set assignment `status=active` and `endsAt` within the next 30 days.
   Expect:
   - patient appears in `Access ending soon`
   - patient header warning shows
   - membership page shows `Ending soon`
   - advanced search row shows `Ending soon`

3. Expired.
   Set assignment `status=active` and `endsAt` in the past.
   Expect:
   - patient remains visible in scoped patient queries
   - the next membership sync converts the stored assignment to `Ended`
   - membership history shows an automatic end note
   - lifecycle filters/surfaces stop treating the patient as currently active

4. Suspended.
   Use `Suspend access`.
   Expect:
   - membership page shows `Suspended`
   - patient remains visible in main patient list when filter is changed to inactive/suspended state
   - direct patient page still loads

5. Ended.
   Use `End membership`.
   Expect:
   - membership page shows `Ended`
   - patient remains visible under `Ended`
   - direct patient page still loads

6. Reactivated.
   Use `Reactivate membership`.
   Expect:
   - membership returns to `Active`
   - new access end date is set
   - membership history shows reactivation

7. App access ending soon.
   Set assignment `status=active` and `endsAt` within the next 30 days.
   Expect:
   - patient can still use the app
   - dashboard shows an `Access ending soon` notice
   - notice includes the end date

8. App access expired or ended.
   Set assignment `status=active` with a past `endsAt`, or end the membership in the portal.
   Expect:
   - app session is cleared on next bootstrap or authenticated API call
   - patient is routed to `Access no longer active`
   - reactivating membership allows sign-in again

### History and labels

1. Membership history actor names.
   Expect:
   - history shows invite events and membership events in one timeline
   - staff actions show staff display name where a `users_staff` record exists
   - patient activation is labelled as patient activity
   - falls back to principal id only when no actor name exists

2. Lifecycle labels.
   Expect the same wording everywhere:
   - `Active`
   - `Ending soon`
   - `Expired`
   - `Suspended`
   - `Ended`
   - `Pending`

### Portal surfaces

1. Main patient list.
   Expect:
   - active, suspended, expired, ended, pending patients can all be found through the membership status filter

2. Advanced search.
   Expect:
   - row subtext shows lifecycle label and access end date
   - it no longer relies on last-contact wording

3. Patient detail page.
   Expect:
   - subheadline shows `eGFR … • <membership status>`
   - access end row still shows `Ending soon` meta when applicable

### Automation

1. Cron/manual expiry sync.
   Run `/api/membership/expire/run`.
   Expect:
   - overdue active assignments are converted to ended assignments
   - an automatic membership history entry is created
   - `Access ending soon` counts no longer include overdue memberships
