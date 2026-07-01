# Worsening Trend Handling

The app should handle early worsening trends first. Trends should only be
escalated to the clinician portal when they are sustained, unexplained,
repeated, severe, or linked with symptoms.

This keeps the app as the first line of defence and avoids turning the portal
into a micro-management workspace for every small change.

## Escalation Model

### Level 1: App-only nudge

Use when the trend is early or likely self-manageable.

Example:

> Your weight is up this week. Review your meals, salt intake, fluid intake,
> and care-plan tasks.

### Level 2: App check-in with context

Use when the app needs to understand whether the trend is expected or
unexplained.

Example:

> Is there a likely reason for this change?

The patient's response helps decide whether the issue remains app-only or
should be escalated.

### Level 3: Clinician portal escalation

Use when the trend is:

- sustained
- unexplained
- repeated
- severe
- linked with symptoms
- linked with multiple worsening trends

## Shared Rule Source

The shared rule source is:

- [packages/core/src/isomorphic/constants/worseningTrends.ts](/Users/royadams/Sites/ckd-copilot/packages/core/src/isomorphic/constants/worseningTrends.ts)

That file is intended to drive:

- app push notification behaviour
- app check-in prompts and coded response options
- portal worsening trend escalation rules

## Current Rule Set

### Steps / Physical Activity

App trigger:

- 7-day average steps are down `>= 30%` compared with the previous 28 days

App behaviour:

- send push notification at detection
- then send a daily reminder at `09:00`
- stop when:
  - the patient recovers towards target, or
  - the trend normalises

Portal escalation:

- steps are still below target after 14 days, or
- steps are still down `>= 30%` after 14 days

### Weight Increase

App trigger:

- weight increase of `>= 2 kg` over 7 days

App behaviour:

- prompt review of:
  - meals
  - salt intake
  - fluid intake
  - care-plan task adherence
- ask whether the gain is expected or unexplained

Portal escalation:

- weight increase is `>= 4 kg` over 7 days, or
- weight increase of `>= 2 kg` continues across 14 days

High-priority context:

- swelling
- breathlessness
- reduced urine
- worsening blood pressure
- other worsening symptoms

### Weight Decrease

App trigger:

- weight decrease of `>= 2 kg` over 7 days

App behaviour:

- prompt review of:
  - appetite
  - food intake
  - recent illness
  - care-plan task adherence
  - whether the loss is intentional

Portal escalation:

- weight decrease is `>= 4 kg` over 7 days, or
- weight decrease of `>= 2 kg` continues across 14 days

High-priority context:

- poor appetite
- nausea
- vomiting
- diarrhoea
- other symptoms
- nutrition worsening

### Nutrition

App trigger:

- 3 of 4 tracked nutrient targets are exceeded on `>= 6` of the last 7 logged
  days

App behaviour:

- push reminder
- care-plan task reminder
- “review meals” nudge

Portal escalation:

- 3 of 4 tracked nutrient targets are exceeded on `>= 12` of the last 14
  logged days

High-priority context:

- worsening weight trend
- increased symptoms
- reduced steps
- worsening blood pressure trend
- worsening fluid trend

### Symptoms

App trigger:

- symptoms are logged on `>= 4` days in the last 7, or
- symptom count/frequency is materially higher than the previous 7 days, or
- the same symptom is logged repeatedly across the week

App behaviour:

- ask whether symptoms are:
  - improving
  - staying the same
  - getting worse

Portal escalation:

- symptoms persist or increase across 14 days

High-priority context:

- weight change
- reduced steps
- poor intake
- worsening nutrition trend

### Blood Pressure

App trigger:

- 7-day average systolic is `>= 15 mmHg` above the previous 28-day average, or
- `>= 10 mmHg` above the patient target

App behaviour:

- push nudge
- ask about:
  - salt intake
  - missed medication
  - stress
  - poor sleep
  - illness
  - symptoms

Portal escalation:

- 7-day average systolic is `>= 20 mmHg` above the previous 28-day average and
  above target, or
- blood pressure remains above target for 14 days

High-priority context:

- weight gain
- swelling
- breathlessness
- activity decline

### Labs

Initial hospital release:

- labs remain visible in the labs section and charts
- labs are not surfaced in the active app/portal worsening-trends workflow

Reasoning:

- hospital lab systems and existing referral pathways usually already own eGFR,
  potassium, phosphate, and similar result escalation
- duplicating that in CKD Copilot risks alert fatigue and unclear ownership

Principle:

- use worsening trends for areas where the app can support early self-management
  and where deterioration may otherwise slip through
- keep labs view-only unless a specific operational gap is identified later

## Design Principle

Do not escalate every small change to the clinician portal.

Use this pattern instead:

**Detect early -> ask for context -> support self-management -> escalate only
when clinically meaningful.**

## Testing

Start with the first implemented rules:

- `steps_decline`
- `weight_increase`

### Automated

Run:

```bash
pnpm --filter ./apps/api test -- worseningTrends
pnpm --filter ./apps/mobile test -- pushNotificationsWorsening
```

These cover:

- 30%+ steps decline against the prior 28-day baseline
- 2 kg+ weight increase across 7 days
- local notification creation and 09:00 repeat scheduling

### Manual

Steps decline:

1. Make sure the patient has enough recent step history.
2. Sync or submit lower step totals for the last 7 days so the 7-day average is
   at least 30% below the prior 28-day average.
3. Open the app or bring it to the foreground.
4. Confirm:
   - a local “Activity down” notification is shown
   - a daily 09:00 reminder is scheduled

Weight increase:

1. Log at least two weights within a 7-day window.
2. Make the latest weight at least 2 kg above the earliest weight in that
   window.
3. Open the app or bring it to the foreground.
4. Confirm:
   - a local “Weight up this week” notification is shown
   - no daily repeat is scheduled for weight at this stage

API verification:

- `GET /api/worsening-trends/active` should return the active patient alerts
  used by the mobile scheduler.
