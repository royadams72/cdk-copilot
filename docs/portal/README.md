# Clinician And Admin Portal

**Status:** Documentation-first planning
**Build target:** `apps/api` Next.js app
**Primary UI location:** `apps/api/app`
**Static assets:** `apps/api/public/portal`

## Decision

For this phase, keep the existing app name as `apps/api`.

Reason:

- it is already the Next.js App Router app in this repo
- it already owns the backend routes the portal will call
- renaming it now adds churn without improving the pilot build

If the portal becomes a larger standalone surface, revisit a rename to `apps/web` or a split into separate `apps/portal` and `apps/api` before broad phase-2 work starts.

## Pilot scope

For the 3/6 month pilot, do **not** implement Trust Leads or Service Leads in the working flow.

Pilot roles:

- `ckd_copilot_admin`
- `pilot_care_team_admin`
- `clinical_staff`
- `governance_reviewer`

Reference:

- [Pilot setup and future model](./pilot-setup.md)
- [Portal feature plan](./feature-plan.md)
- [Portal asset manifest](./assets.md)

## Design references

PNG assets from the supplied design zip should live under:

- `apps/api/public/portal/icons`
- `apps/api/public/portal/reference`

The reference images are for implementation guidance only. Production UI components should be built in code and should not depend on image mockups.

## First implementation slice

Start with documentation and structure for:

1. pilot hierarchy and access rules
2. portal information architecture
3. security/session requirements
4. patient list and dashboard requirements
5. bulk add/invite flow

After that, implement feature-by-feature.
