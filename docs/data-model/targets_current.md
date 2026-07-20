# targets_current

This document defines the `targets_current` MongoDB collection.

Purpose:

- Stores the displayed reference, patient personal goal, or care-team target for
  a patient.
- Read-optimised for dashboards, calculations, and comparisons.
- Reflects the resolved state after:
  - guideline-based recommendation
  - user override
  - clinician override

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
- `effective` resolves in this order: care-team target, personal goal, general
  reference.
- The legacy `override` and `overrideMeta` fields mirror the effective non-reference
  value for backward compatibility.
- Patient and care-team values can coexist; neither update path deletes the other.
- Explicit rule lineage (`derivedFrom`)

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
  "override": null,
  "effective": { "type": "max", "value": 2000, "basis": "perDay" },
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
nutrition-worsening notifications.

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
- Every update MUST insert a `targets_ledger` event.
- `effective` must always equal:
  - `override` if present
  - otherwise `recommended`
