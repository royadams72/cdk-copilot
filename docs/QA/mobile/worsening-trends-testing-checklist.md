# Worsening Trends Testing Checklist

Use this after rebuilding the mobile app and restarting the API.

## Debug endpoints

- Active patient debug snapshot:
  - `GET /api/worsening-trends/debug`
  - Confirms:
    - `activeAlerts`
    - persisted `states`
    - persisted `snapshots`
    - saved `checkIns`

## Weight increase

- Add at least 2 weight readings in the last 7 days with a rise of `>= 2kg`.
- Open the app and let worsening sync run.
- Verify:
  - immediate alert appears
  - `Review now` / `Check in now` opens the weight check-in
  - saving an explained reason keeps the trend app-managed
  - saving a concerning reason changes the alert to clinician-eligible
  - `/api/worsening-trends/debug` shows:
    - active episode in `states`
    - saved response in `checkIns`
    - `viewedAt` populated after opening

## Weight decrease

- Add at least 2 weight readings in the last 7 days with a fall of `>= 2kg`.
- Verify:
  - immediate alert appears
  - check-in opens
  - `intentional_weight_loss` downgrades to app-managed
  - symptom-related or unknown answers mark it for escalation

## Blood pressure

- The current code rule uses these windows:
  - recent window: today and the previous 7 days
  - previous window: the 28 days before the recent window
- Minimum data required before BP can trigger:
  - at least 2 recent BP readings
  - at least 8 previous BP readings
- A BP alert triggers when either:
  - recent 7-day average systolic is `>= 15 mmHg` above the previous 28-day average, or
  - recent average systolic is `>= 10 mmHg` above the patient systolic target
- Important testing note:
  - readings that fall inside the recent 7-day window do not count toward the previous 28-day baseline
  - example: if `June 19, 2026`, `June 23, 2026`, and `June 26, 2026` are all in the recent window, then a systolic set of `100, 120, 120` gives a recent average of `113.3`, which is only `+13.3` above a baseline of `100`, so it will not trigger the `>= 15` rule
- Verify:
  - immediate alert appears
  - alert opens BP check-in, not an unmatched route
  - explained answers keep it app-managed
  - headache, swelling, breathlessness, or unknown mark it for escalation
  - `Review trend` opens the BP metric trend screen

## Symptoms

- Log symptoms on at least 4 of the last 7 days, or repeat the same symptom through the week.
- Verify:
  - immediate alert appears
  - symptoms check-in opens
  - `improving` downgrades to app-managed
  - `worse` marks it for escalation

## Steps decline

- Create step data so the 7-day average is down `>= 30%` vs the previous 28 days.
- Verify:
  - immediate alert appears once
  - daily reminder schedules for `09:00`
  - `/api/worsening-trends/debug` shows one active `steps_decline` episode
  - if the decline remains unresolved for 14 days, the alert becomes clinician-eligible
  - once steps recover towards target or baseline, the episode resolves and reminders stop

## Nutrition worsening

- Create logged nutrition days so 3 of 4 tracked nutrients are over target on at least 6 of the last 7 logged days.
- Verify:
  - active alert appears
  - no check-in screen is shown
  - if the pattern reaches 12 of the last 14 logged days, it becomes clinician-eligible

## Labs

- In the initial hospital release, labs are view-only.
- Do not expect eGFR, potassium, phosphate, or abnormal lab flags to appear in:
  - `activeAlerts`
  - worsening trend `states`
  - worsening trend `snapshots`
  - the portal worsening-trends queue

- Verify instead:
  - labs remain visible in the patient labs screens
  - recent history and charts still load correctly
  - no lab-only change creates a worsening-trends alert

## Viewed / dedupe lifecycle

- Trigger any worsening alert.
- Open it once.
- Verify:
  - `viewedAt` is set in `/api/worsening-trends/debug`
  - the same active episode does not keep presenting as a fresh immediate alert
  - once the underlying condition resolves, the episode disappears from `activeAlerts`
  - if the same trend reappears later, it gets a new episode id and can alert again

## Clinician portal

- Open `/portal?filter=worsening`
- Verify:
  - patients with active worsening episodes appear without relying on old flags
  - each row summarizes active items
  - the modal shows:
    - duration in days
    - patient response when present
    - whether clinician review is suggested
    - link to the related portal section
- Test `Notify patient(s)` on selected rows.

## Mobile event log

- After testing alerts, inspect:
  - `GET /api/users/health-connect/event-log?limit=100`
- Verify worsening-related events such as:
  - `worsening-alert-presented`
  - `worsening-alert-viewed`
  - `worsening-alert-suppressed`
  - `worsening-reminder-scheduled`

- Performance note:
  - the portal patient list now computes active worsening episodes per patient instead of reading only flags
  - that is correct for now, but if accessible patient count grows a lot, this route should move toward batched or precomputed summaries
