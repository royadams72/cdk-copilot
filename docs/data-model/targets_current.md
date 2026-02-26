# Targets collections

This document defines the MongoDB collections used to support **nutrition and clinical targets** in CKD Copilot.

Design goals:

- **Auditable**: every target recommendation can be traced to a rule and a version.
- **Deterministic**: the app computes recommendations via rules (not via free-form AI).
- **Override-friendly**: users and clinicians can override recommendations with explicit reasons.
- **Append-only history**: all changes are captured in a ledger.

## Collections

- `targets_reference` — versioned ruleset of recommended targets (the “reference database”).
- `targets_current` — the currently effective targets for a patient (read-optimized).
- `targets_ledger` — append-only event log of target changes (source of truth history).

# targets_current

This document defines the `targets_current` MongoDB collection.

Purpose:

- Stores the **currently active (effective)** targets for a patient.
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
- Clear separation between:
  - `recommended`
  - `override`
  - `effective`
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
| `ruleset`    | `string` | ✅       | e.g. `targets_reference`          |
| `runId`      | `string` | ✅       | Unique engine run id              |
| `computedAt` | `date`   | ✅       | When recommendation was generated |

---

# Metric State Structure

Each key in `targets` maps to:

```json
{
  "unit": "mg/day",
  "recommended": { "type": "max", "value": 2000, "basis": "perDay" },
  "override": null,
  "effective": { "type": "max", "value": 2000, "basis": "perDay" },
  "derivedFrom": {
    "ruleId": "kdigo-2024-sodium-all-ckd-v1",
    "version": 1,
    "matchedAt": "2026-02-25T12:00:00.000Z"
  },
  "overrideMeta": null
}
```

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
