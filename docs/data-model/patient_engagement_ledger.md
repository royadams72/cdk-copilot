# patient_engagement_ledger

**Purpose:** Append-only ledger of patient engagement achievements and streak events so clinicians can review meaningful adherence/activity signals and patients can receive each earned win exactly once via notification and in-app surfacing.
**Contains PII:** No direct PII; linked via `patientId`.
**Access:** App server, patient (self), clinicians/dietitians/admins with assigned access. Reads should be audited because this becomes part of the clinical activity view.
**Model:** Derived ledger. Source events come from existing ledgers such as `measurements_ledger`, `nutrition_entries`, and current target snapshots. This collection stores durable, clinician-readable milestones that have already been earned.

## Why a ledger instead of a live calculation

- Lets clinicians see a stable history of wins and adherence signals.
- Avoids expensive streak recomputation across meals, steps, sleep, and exercise on every dashboard load.
- Makes patient notifications and in-app celebration surfaces idempotent by giving each earned achievement a deterministic key.
- Preserves the exact source rows and thresholds that triggered the achievement even if targets change later.

## Shape

- `_id` · ObjectId
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `type` · string enum
- `key` · string deterministic achievement key
- `achievedAt` · Date
- `sourceRefs[]` · source rows or source dates that triggered the achievement
- `metadata?` · object
- `delivery?` · object for one-time patient notification and in-app surfacing
- `createdAt` · Date
- `createdBy` · actor, usually system

## Recommended `type` values

- `steps_target_streak`
- `steps_multiplier_streak`
- `first_steps_threshold`
- `meal_logging_streak`
- `meal_targets_streak`
- `sleep_logging_streak`
- `exercise_days_streak`
- `weight_loss_weeks_streak`

Keep `type` coarse and reusable. Put the specific threshold/window inside `key` and `metadata`.

## Field details

| Field        | Type       | Required | Notes                                                        |
| ------------ | ---------- | -------- | ------------------------------------------------------------ |
| `_id`        | `ObjectId` | ✅       | Mongo id                                                     |
| `patientId`  | `ObjectId` | ✅       | Patient who earned the event                                 |
| `orgId`      | `string`   | ✅       | Org scope for clinician queries                              |
| `type`       | `string`   | ✅       | Achievement family                                           |
| `key`        | `string`   | ✅       | Deterministic unique key per patient achievement             |
| `achievedAt` | `date`     | ✅       | Timestamp when the achievement was first satisfied           |
| `sourceRefs` | `object[]` | ✅       | Evidence rows/dates used to award the event                  |
| `metadata`   | `object`   | ❌       | Threshold, streak length, display copy, summary stats        |
| `delivery`   | `object`   | ❌       | Tracks one-time patient notification and in-app presentation |
| `createdAt`  | `date`     | ✅       | Insert timestamp                                             |
| `createdBy`  | `object`   | ✅       | Usually `{ actorType: "system" }`                            |

## `createdBy`

```json
{
  "principalId": "engagement-engine",
  "actorType": "system",
  "displayName": "Engagement Engine"
}
```

## `sourceRefs[]`

Each source reference should be explicit enough for a clinician timeline or later audit drill-down.

```json
{
  "collection": "measurements_ledger",
  "documentId": "6809a8c5d1c23c0af2a81234",
  "kind": "steps",
  "sourceDate": "2026-04-24",
  "measuredAt": "2026-04-24T21:00:00.000Z"
}
```

Recommended fields:

- `collection` · `measurements_ledger|nutrition_entries|targets_current|targets_ledger`
- `documentId?` · ObjectId/string when there is a concrete source row
- `kind?` · `steps|exercise|sleep|meal|weight|target`
- `sourceDate?` · `YYYY-MM-DD` for day-based streak windows
- `measuredAt?` / `eatenAt?` / `weekStart?` · Date/string depending on trigger type

For target-based meal streaks, include both the meal rows and the target snapshot used to evaluate them.

## `metadata`

Suggested optional fields:

| Field | Type | Use | Example |
| --- | --- | --- | --- |
| `threshold` | `number` | Numeric threshold used for the achievement when applicable | `10000` for first steps threshold |
| `thresholdUnit` | `string` | Human-readable unit for `threshold` or target value | `"steps/day"`, `"mg/day"` |
| `streakLength` | `number` | Number of consecutive qualifying periods | `3`, `5`, `7` |
| `window` | `object` | Time window that produced the achievement, including boundaries/timezone | `{ "kind": "daily_streak", "startDate": "2026-04-20", "endDate": "2026-04-24", "timezone": "Europe/London" }` |
| `targetMetric` | `string` | Metric evaluated for target-based achievements | `"steps"`, `"phosphorusMg"`, `"proteinG"` |
| `targetValue` | `number` | Exact effective target used when the achievement was awarded | `800` for phosphorus, `7000` for steps |
| `copy` | `object` | Prebuilt patient-facing strings for push and in-app UX | `{ "title": "5-day meal streak", "body": "Meals logged five days in a row." }` |
| `days` | `string[]` | Exact day tokens that counted toward a day-based streak | `["2026-04-20", "2026-04-21", "2026-04-22"]` |
| `weeks` | `string[]` | Exact week tokens that counted toward a week-based trend achievement | `["2026-W15", "2026-W16", "2026-W17"]` |
| `stats` | `object` | Snapshot of the evidence values that justified the achievement | `{ "dailyCounts": [10234, 11450, 10888], "target": 7000 }` |

Guidance:

- `window`, `days`, and `weeks` explain when the achievement was earned.
- `targetMetric` and `targetValue` explain what target or rule was evaluated.
- `stats` captures the supporting numbers so later reads do not need to recompute them.
- `copy` lets notification and in-app surfaces stay consistent without rebuilding strings in multiple clients.

Example:

```json
{
  "threshold": 10000,
  "thresholdUnit": "steps/day",
  "streakLength": 5,
  "window": {
    "kind": "daily_streak",
    "startDate": "2026-04-20",
    "endDate": "2026-04-24",
    "timezone": "Europe/London"
  },
  "days": ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"],
  "copy": {
    "title": "5-day step streak",
    "body": "You hit your daily steps target five days in a row."
  },
  "stats": {
    "dailyCounts": [10042, 11108, 10877, 12034, 10210],
    "target": 7000
  }
}
```

## `delivery`

This object is for patient-facing delivery state. It lets one earned row support:

- clinician review history
- one notification when the achievement is awarded
- one in-app celebration/card/banner until the patient opens it

Suggested shape:

```json
{
  "notification": {
    "status": "pending",
    "sentAt": null
  },
  "inApp": {
    "status": "pending",
    "firstShownAt": null,
    "openedAt": null
  }
}
```

Recommended semantics:

- `delivery.notification.status` · `pending|sent|skipped|failed`
- `delivery.notification.sentAt` · when the push/local notification was actually sent
- `delivery.inApp.status` · `pending|shown|opened|dismissed|expired`
- `delivery.inApp.firstShownAt` · first time the app rendered the achievement to the patient
- `delivery.inApp.openedAt` · first time the patient opened or tapped into the achievement details

Recommended flow:

- Insert new achievements with `notification.status="pending"` and `inApp.status="pending"`.
- Send the notification once, then set `notification.status="sent"`.
- Keep the in-app celebration available until the patient opens it once, then set `inApp.status="opened"`.
- After `opened`, do not re-surface the celebration banner/card again.

## Deterministic key patterns

The key should represent one patient-earnable achievement exactly once. Recommended patterns:

- `first_steps_threshold:10000`
- `steps_target_streak:3:2026-04-24`
- `steps_target_streak:5:2026-04-24`
- `steps_multiplier_streak:1.5x:3:2026-04-24`
- `steps_multiplier_streak:2x:3:2026-04-24`
- `meal_logging_streak:3:2026-04-24`
- `meal_targets_streak:phosphorusMg,max,3:2026-04-24`
- `meal_targets_streak:proteinG,max,5:2026-04-24`
- `sleep_logging_streak:manual:7:2026-04-24`
- `exercise_days_streak:7:2026-04-24`
- `weight_loss_weeks_streak:3:2026-W17`

Interpretation:

- Use the trailing date/week token as the window end that completed the streak.
- If a patient later earns a longer streak, that is a new row with a different key.
- If the same streak is recalculated again from the same source period, the unique key prevents duplicates.

## Candidate achievements for v1

### 1. Logging streaks

- Meals logged for `3`, `5`, `7` consecutive days
- Manual sleep logged for `3`, `5`, `7` consecutive days
- Exercise logged for `3`, `5`,`7` consecutive days

Suggested copy:

- `3` days: "3 days on track."
- `5` days: "5-day streak."
- `7` exercise days: "You're a beast!!"

### 2. Steps achievements

- First time hitting a threshold such as `10000`
- `3`, `5`, `7` consecutive days at or above the patient step target
- `3` consecutive days at `1.5x` step target
- `3` consecutive days at `2x` step target

This should evaluate against the effective lifestyle target in `targets_current` where available. If no patient target exists, either skip the target-based event or use a clearly versioned product default.

### 3. Meal adherence achievements

- `3`, `5`, `7` consecutive days logging meals
- `3`, `5`, `7` consecutive days staying below configured nutrition targets

Reasonable target metrics for v1:

- `phosphorusMg`
- `proteinG`
- `sodiumMg`
- `potassiumMg`

Recommendation:

- Award these from daily rolled-up totals, not per individual meal rows, even if `sourceRefs` point back to the meal entries for those days.
- Store the evaluated target snapshot in `metadata` so later target changes do not rewrite history.

### 4. Weight trend achievements

- Losing weight `3` weeks in a row

Recommendation:

- Use a weekly rollup with a deterministic week boundary, for example ISO week ending Sunday in the patient/org timezone.
- Require a minimum number of readings or a clear weekly representative value rule so noisy single readings do not create false positives.

## Example documents

### Example: meal logging streak

```json
{
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "type": "meal_logging_streak",
  "key": "meal_logging_streak:5:2026-04-24",
  "achievedAt": { "$date": "2026-04-24T20:15:00.000Z" },
  "sourceRefs": [
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-20",
      "kind": "meal"
    },
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-21",
      "kind": "meal"
    },
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-22",
      "kind": "meal"
    },
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-23",
      "kind": "meal"
    },
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-24",
      "kind": "meal"
    }
  ],
  "metadata": {
    "streakLength": 5,
    "copy": {
      "title": "5-day meal streak",
      "body": "Meals logged five days in a row."
    }
  },
  "delivery": {
    "notification": {
      "status": "pending",
      "sentAt": null
    },
    "inApp": {
      "status": "pending",
      "firstShownAt": null,
      "openedAt": null
    }
  },
  "createdAt": { "$date": "2026-04-24T20:15:00.000Z" },
  "createdBy": {
    "principalId": "engagement-engine",
    "actorType": "system",
    "displayName": "Engagement Engine"
  }
}
```

### Example: meal targets streak

```json
{
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "type": "meal_targets_streak",
  "key": "meal_targets_streak:phosphorusMg,max,3:2026-04-24",
  "achievedAt": { "$date": "2026-04-24T20:20:00.000Z" },
  "sourceRefs": [
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-22",
      "kind": "meal"
    },
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-23",
      "kind": "meal"
    },
    {
      "collection": "nutrition_entries",
      "sourceDate": "2026-04-24",
      "kind": "meal"
    },
    { "collection": "targets_current", "kind": "target" }
  ],
  "metadata": {
    "targetMetric": "phosphorusMg",
    "targetType": "max",
    "targetValue": 800,
    "thresholdUnit": "mg/day",
    "streakLength": 3,
    "copy": {
      "title": "3 days below phosphorus target",
      "body": "Daily phosphorus stayed below the current target for three straight days."
    }
  },
  "delivery": {
    "notification": {
      "status": "pending",
      "sentAt": null
    },
    "inApp": {
      "status": "pending",
      "firstShownAt": null,
      "openedAt": null
    }
  },
  "createdAt": { "$date": "2026-04-24T20:20:00.000Z" },
  "createdBy": {
    "principalId": "engagement-engine",
    "actorType": "system",
    "displayName": "Engagement Engine"
  }
}
```

## Indexes

```js
db.patient_engagement_ledger.createIndex({ patientId: 1, achievedAt: -1 });
db.patient_engagement_ledger.createIndex({
  orgId: 1,
  patientId: 1,
  achievedAt: -1,
});
db.patient_engagement_ledger.createIndex({ orgId: 1, type: 1, achievedAt: -1 });
db.patient_engagement_ledger.createIndex(
  { patientId: 1, key: 1 },
  { unique: true },
);
```

If clinicians will browse org-wide recent activity, also consider:

```js
db.patient_engagement_ledger.createIndex({ orgId: 1, achievedAt: -1 });
```

## Write rules

- Never update or delete an earned achievement row.
- Recomputations must be idempotent through the `(patientId, key)` unique index.
- If business rules change later, emit new keys rather than mutating historical rows.
- `achievedAt` should reflect when the final qualifying source event happened, not when the batch job ran.
- Streaks should be computed in a single agreed timezone per patient or org and persisted consistently.
- `delivery` may be updated in place because it tracks patient-facing handling state, not the earned achievement itself.
- Patient-facing delivery must be one-time per row: one notification send and one in-app open flow.

## Clinician read patterns

- Recent patient engagement timeline: `{ patientId }` sorted by `achievedAt desc`
- Recent org-wide activity feed: `{ orgId, achievedAt: { $gte: ... } }`
- Filter to adherence type: `{ patientId, type: "meal_targets_streak" }`

## Patient read patterns

- Pending in-app celebrations: `{ patientId, "delivery.inApp.status": "pending" }`
- Recently shown but unopened items: `{ patientId, "delivery.inApp.status": "shown" }`
- Recent achievement history: `{ patientId }` sorted by `achievedAt desc`
- Retryable sends: `{ "delivery.notification.status": "pending" }`

## Suggestions / scope notes

- Start with celebratory events only. Do not mix in negative signals like "missed streak" in the same collection.
- Keep v1 write-only from backend jobs or post-write hooks; do not compute this on the mobile client.
- Prefer day-level and week-level derived inputs before awarding streaks, especially for meals and weight.
- Later, if needed, add a `patient_engagement_current` projection for "highest current streak" or "latest badge shelf", but keep this ledger as the source of truth.
- If strict immutability is more important than simplicity, move `delivery` into a separate `patient_engagement_delivery` collection keyed by `(patientId, key)`. For v1, embedding it is simpler.
