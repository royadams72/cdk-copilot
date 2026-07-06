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
   - membership filter `Expired` finds the patient
   - membership page shows `Expired`

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

### History and labels

1. Membership history actor names.
   Expect:
   - history shows staff display name where a `users_staff` record exists
   - falls back to principal id only when no staff name exists

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
