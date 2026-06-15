# Portal Feature Plan

## Build location

Use `apps/api/app` for the clinician/admin portal UI and `apps/api/app/api` for the supporting routes.

Static assets should live in `apps/api/public/portal`.

## Feature order

### 0. Documentation and structure

- document pilot scope
- document future phase-2 model
- place provided design assets in a stable public folder
- define route map, role map, and security rules before UI work

### 1. Auth, session, and shell

- OTP email login for clinicians
- JWT checked on every client request
- server-side session with keepalive
- idle logout after 20 minutes
- warning modal at 18 minutes
- activity listeners: `mousemove`, `mousedown`, `keypress`, `scroll`, `touchstart`
- cross-tab coordination via `BroadcastChannel`
- leader-tab pattern so only one warning modal is shown
- clear browser state on logout

### 2. Pilot setup and patient intake

- patient search in header
- advanced search page for name, DOB, or email
- add patient modal/page
- bulk upload with preflight validation
- invite creation with 7-day activation expiry
- access duration choices: `3`, `6`, `12` months
- audit log for create/import/invite actions

### 3. Main clinician dashboard

- stat panels:
  - worsening trends this month
  - missing data / disengaged
  - access ending soon
  - care plan review due
- each panel filters the patient list
- patient list opens patient dashboard

### 4. Patient dashboard

- summary for month / 3 months / 6 months / year / all
- server-computed summary values preferred
- large navigation actions:
  - nutrition
  - health data
  - care plans
  - diagnoses
  - medication profile
  - nutrition profile
  - messaging
  - patient targets

### 5. Care plans

- current-first list plus expired/review-due plans
- create/edit/review flow
- ledger-style history with current projection
- review reminder emails

### 6. Staff feedback questionnaire

- modal every 3 weeks
- if unanswered, resurface daily
- show free-text field whenever `Other` is selected

## Data table differences

The health data screen and nutrition data screen should not share one generic table without configuration.

### Nutrition data

- table is food-oriented
- grouped around meals, foods, nutrients, or nutrition-target context
- should support nutrition-specific summaries and top-offender views
- long-term read model should prefer a derived monthly summary collection for
  historical months; see `docs/portal/nutrition-monthly-summary.md`

### Health data

- table must adapt to the selected metric
- examples from the spec:
  - blood pressure table
  - weight table
  - symptoms table
- columns change by metric, so use a metric-driven table config rather than a fixed schema

Suggested approach:

- shared table shell component
- per-screen column definitions
- per-metric row mappers for health data

## Route planning

Suggested App Router structure:

```text
apps/api/app/
  (portal)/
    layout.tsx
    page.tsx
    patients/
      [patientId]/page.tsx
      nutrition/page.tsx
      health/page.tsx
      care-plans/page.tsx
      diagnoses/page.tsx
      medications/page.tsx
      nutrition-profile/page.tsx
      messages/page.tsx
      targets/page.tsx
    search/page.tsx
    add-patients/page.tsx
```

## Repo structure guidance

- keep shared reusable portal types/utils in `apps/api/lib`
- move app-shared logic to packages only when it is truly cross-app
- keep feature-local types/utils next to the feature when they are not reused elsewhere
- centralise CSS/tokens rather than feature-by-feature ad hoc styling

## Known design constraint

The portal should be implemented as real React UI, not image-backed screens. The supplied PNGs are references for layout, icons, and visual direction only.
