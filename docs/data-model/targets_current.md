# targets_current

This document defines the `targets_current` MongoDB collection.

Purpose:

- Stores the displayed reference, patient personal goal, or care-team target for
  a patient.
- Read-optimised for dashboards, calculations, and comparisons.
- Reflects the resolved state after explicit patient selection and care-team updates.

This collection should always be updated together with a corresponding
`targets_ledger` insert.

---

# Collection: `targets_current`

## Design principles

- One document per `{ orgId, patientId }`
- Deterministic structure per metric
- `recommended` is retained as the storage key for backward compatibility, but
  represents a **general reference**, not a personalised recommendation.
- `personalGoal` and `personalGoalMeta` store a patient-owned goal.
- `careTeamTarget` and `careTeamTargetMeta` store a clinician/dietitian-owned
  target.
- `effective` resolves in this order: care-team target, personal goal, selected
  general reference, otherwise `null` (unset).
- `generalReferenceSelected` is `false` for newly seeded targets. The stored
  `recommended` reference is informational until the patient explicitly selects it.
- Older completed rows without this flag retain their pre-redesign reference
  behavior until separately reviewed or migrated. An incomplete patient's
  required onboarding review treats a missing flag as unset; confirmation
  writes `false` for unchosen references and preserves any personal or
  care-team value, with a ledger event.
- The legacy `override` and `overrideMeta` fields mirror the effective non-reference
  value for backward compatibility.
- Patient and care-team values can coexist; neither update path deletes the other.
- Explicit rule lineage (`derivedFrom`)
- Numeric renal nutrition targets used by the renal nutrition profile are stored
  here rather than in a separate nutrition-profile collection.

---

## Top-Level Schema

| Field       | Type       | Required | Description                     |
| ----------- | ---------- | -------- | ------------------------------- |
| `_id`       | `ObjectId` | ✅       | MongoDB document id             |
| `orgId`     | `string`   | ✅       | Organisation identifier         |
| `patientId` | `ObjectId` | ✅       | Patient identifier              |
| `updatedAt` | `date`     | ✅       | Last update timestamp           |
| `updatedBy` | `object`   | ✅       | Actor who performed update      |
| `engine`    | `object`   | ✅       | Rule engine metadata snapshot   |
| `targets`   | `object`   | ✅       | Map of metricKey → target state |
| `flags`     | `string[]` | ❌       | Optional system flags           |

---

## `updatedBy`

| Field         | Type                                | Required |
| ------------- | ----------------------------------- | -------- |
| `principalId` | `string`                            | ✅       |
| `actorType`   | `"user" \| "clinician" \| "system"` | ✅       |
| `displayName` | `string \| null`                    | ❌       |

---

## `engine`

| Field        | Type     | Required | Description                       |
| ------------ | -------- | -------- | --------------------------------- |
| `ruleset`    | `string` | ✅       | e.g. `clinical_reference_rules`   |
| `runId`      | `string` | ✅       | Unique engine run id              |
| `computedAt` | `date`   | ✅       | When recommendation was generated |

---

# Metric State Structure

Each key in `targets` maps to:

```json
{
  "domain": "renal",
  "metric": "sodium_mg_day",
  "unit": "mg/day",
  "recommended": { "type": "max", "value": 2000, "basis": "perDay" },
  "generalReferenceSelected": false,
  "override": null,
  "effective": null,
  "derivedFrom": {
    "ruleId": "ckd-sodium-default-v1",
    "version": 1,
    "matchedAt": "2026-02-25T12:00:00.000Z"
  },
  "overrideMeta": null
}
```

`domain` should be used to separate clinical/nutrition targets from lifestyle
targets while still using one target pipeline:

- `renal` for CKD and renal nutrition targets
- `lifestyle` for goals like steps/day or sleep duration

The `recommended` field name is legacy. User interfaces and API consumers must
describe it as a `General reference`. A system-seeded reference must not be
represented as personalised clinical advice or used to generate automatic
nutrition notifications.

Renal nutrition profile storage split:

- descriptive profile fields live in `health_profiles_current`
- numeric renal nutrition targets live in `targets_current`

---

## Target Object

| Field   | Type                                   | Required |
| ------- | -------------------------------------- | -------- |
| `type`  | `"range" \| "max" \| "min" \| "exact"` | ✅       |
| `low`   | `number \| null`                       | ❌       |
| `high`  | `number \| null`                       | ❌       |
| `value` | `number \| null`                       | ❌       |
| `basis` | `"perDay" \| "perKgPerDay" \| null`    | ❌       |

---

## Indexes

- Unique: `{ orgId: 1, patientId: 1 }`
- Query: `{ orgId: 1, updatedAt: -1 }`
- Optional: `{ patientId: 1 }`

---

## Update Rules

- Never mutate nested values silently.
- Every patient/clinician target update MUST insert a `targets_ledger` event.
- A newly seeded general reference is stored but not active; it does not create
  a comparison line or target-streak notification until selected.
- `effective` must equal `careTeamTarget ?? personalGoal ?? (generalReferenceSelected
  ? recommended : null)`. A care-team update never deletes the patient's goal.
- The onboarding target-review step is required, but individual metrics may
  remain unset. Unset metrics show recorded data without a target comparison.
- The patient can select a general reference per metric, fill general references
  for currently unset metrics, or enter a custom personal goal. Confirmation
  is blocked while edited choices remain unsaved. A clinician-set target stays
  separate and takes priority in comparisons.
- Target editing rejects zero/non-finite values and non-increasing ranges.
- Target-based meal and step streaks require an active value for that metric;
  logging-only milestones and fixed recorded-activity milestones (such as a
  10,000-step day) do not. Nutrition and activity graphs omit target
  lines or progress percentages when the metric is unset. The derived
  phosphorus-to-protein ratio has no fallback target when its source targets
  are missing.
- Monthly nutrition graphs use the current active target, not a historical
  snapshot, so removing a target immediately removes the line. Historic
  snapshots remain in stored summaries for audit/context.
- The clinician target and nutrition-profile forms display `No target set`
  when `effective` is null. They may use the stored general reference as an
  editing template, but do not activate it by merely displaying it.

## Deployment note

Apply the updated `targets_current` and `targets_ledger` MongoDB validators
before deploying this API/mobile flow: new rows use nullable `effective`, the
selection flag, separate `personalGoal`/`careTeamTarget` values with attribution
metadata, and nullable ledger `after` values for removals. On 15 September
2026, the two target validators were applied to the database configured by
`MONGODB_URI_MIGRATIONS` and read back successfully; no patient records or
indexes were changed. Other environments still need the same targeted
validator deployment. Test all-unset, partial-target,
care-team-priority, and legacy incomplete-account onboarding against that
environment before release.
