# targets_ledger

This document defines the `targets_ledger` MongoDB collection.

Purpose:

- Append-only audit history of all changes to patient targets.
- Supports compliance, traceability, and clinical review.
- Mirrors existing `*_ledger` pattern.

This collection should NEVER be updated in-place (except controlled supersession).

---

# Collection: `targets_ledger`

## Design principles

- Append-only
- Immutable event records
- Explicit before/after state
- Idempotency-safe
- Correction-aware

---

## Top-Level Schema

| Field          | Type               | Required | Description               |
| -------------- | ------------------ | -------- | ------------------------- |
| `_id`          | `ObjectId`         | ✅       | MongoDB document id       |
| `orgId`        | `string`           | ❌       | Organisation id           |
| `patientId`    | `ObjectId`         | ✅       | Patient id                |
| `createdAt`    | `date`             | ✅       | Event timestamp           |
| `createdBy`    | `object`           | ✅       | Actor who triggered event |
| `eventType`    | `string`           | ✅       | Type of change            |
| `metric`       | `string`           | ✅       | Metric affected           |
| `domain`       | `string`           | ✅       | `renal` or `lifestyle`    |
| `before`       | `object \| null`   | ✅       | State before change       |
| `after`        | `object \| null`   | ✅       | State after change; null when unset |
| `derivedFrom`  | `object \| null`   | ❌       | Rule lineage              |
| `reason`       | `string \| null`   | ❌       | Human explanation         |
| `idemKey`      | `string \| null`   | ❌       | Idempotency key           |
| `correctionOf` | `ObjectId \| null` | ❌       | If correcting prior event |
| `superseded`   | `boolean`          | ✅       | Default false             |

---

## `createdBy`

| Field         | Type                                | Required |
| ------------- | ----------------------------------- | -------- |
| `principalId` | `string`                            | ✅       |
| `actorType`   | `"user" \| "clinician" \| "system"` | ✅       |
| `displayName` | `string \| null`                    | ❌       |

---

## Common `eventType` values

- `system_recommended_target` . The rules engine calculated a recommended target
- `user_changed_target` . Patient changed their personal goal or general-reference selection
- `clinician_changed_target` . Clinician changed the separate care-team target
- `manual_target_removed` . Actor removed their own target/selection; inspect `createdBy.actorType`
- `system_recalculated_target`
- `admin_adjusted_target`
- `ledger_correction`

- Examples:
  • patient sets a personal goal or selects a general reference → user_changed_target
  • clinician sets/updates a care-team target → clinician_changed_target
  • patient removes their goal/selection → manual_target_removed (user actor)
  • clinician removes a care-team target → manual_target_removed (clinician actor)
  • rules run after labs/profile change → system_recalculated_target
  • initial creation by engine → system_recommended_target
  • staff fixes a prior event → ledger_correction (+ correctionOf)

---

## Example Event

```json
{
  "orgId": "",
  "patientId": "65f0c2b8b3f0c2b8b3f0c2b8",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "createdBy": {
    "principalId": "principal_123",
    "actorType": "clinician",
    "displayName": "Dietitian A"
  },
  "eventType": "clinician_changed_target",
  "domain": "renal",
  "metric": "protein_g_kg_day",
  "before": { "type": "max", "value": 0.8 },
  "after": { "type": "exact", "value": 0.9 },
  "derivedFrom": {
    "ruleId": "kdoqi-2020-protein-ckd3-5-nondialysis-v1",
    "version": 1
  },
  "reason": "Dietitian muscle maintenance plan",
  "idemKey": "targets:protein:override:20260225T1200Z",
  "correctionOf": null,
  "superseded": false
}
```

---

## Indexes

- Query: `{ orgId: 1, patientId: 1, createdAt: -1 }`
- Optional unique sparse: `{ idemKey: 1 }`
- Optional: `{ orgId: 1, metric: 1, createdAt: -1 }`

---

## Ledger Rules

- Never delete events.
- Never modify historical values.
- Use `correctionOf` + `superseded: true` for logical corrections.
- `targets_current` must always reflect the latest non-superseded ledger state.
- A stored inactive general reference is an audit event, not evidence that the
  patient selected it. The current row's `generalReferenceSelected` flag and
  separate personal/care-team fields determine the active comparison value.
- If a target comes from rule evaluation, `derivedFrom` should reference
  `clinical_reference_rules.ruleId/version`.
