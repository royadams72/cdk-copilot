# clinical_reference_rules

Unified reference/rules collection for:

- lab interpretation ranges (`kind = "lab_range"`)
- recommended target rules (`kind = "clinical_target"` or `kind = "health_target"`)

This replaces the separate reference-layer docs for `targets_reference` and
`labs_reference_ranges` while keeping `*_ledger` and `*_current` collections
separate by domain.

## Purpose

- One versioned source of truth for rule-driven recommendations/interpretation.
- Deterministic rule selection with audit lineage (`ruleId`, `version`).
- Supports organisation-specific overrides via `orgId`.

## Collection

`clinical_reference_rules`

## Document shape

```json
{
  "_id": "ObjectId",
  "ruleId": "string",
  "version": 1,
  "status": "active",
  "kind": "clinical_target",
  "code": "sodium_mg_day",
  "unit": "mg/day",
  "orgId": null,
  "appliesWhen": {
    "ckdStage": "any",
    "dialysis": "any",
    "sex": "any",
    "ageMin": 18,
    "ageMax": 150
  },
  "priority": 50,
  "rule": {
    "target": { "type": "max", "value": 2000, "basis": "perDay" }
  },
  "source": {
    "publisher": "KDIGO",
    "title": "CKD guideline executive summary",
    "year": 2024,
    "url": null,
    "note": null
  },
  "createdAt": "2026-02-26T00:00:00.000Z",
  "updatedAt": "2026-02-26T00:00:00.000Z"
}
```

## Kind-specific rule payload

- `kind = "lab_range"`: `rule.range = { lower?, upper?, criticalLow?, criticalHigh? }`
- `kind = "clinical_target" | "health_target"`:
  `rule.target = { type, low?, high?, value?, basis? }`

## Deterministic selection

For candidate matches:

1. highest `priority`
2. highest `version`
3. latest `updatedAt`

## Indexes

```js
db.clinical_reference_rules.createIndex({ ruleId: 1, version: 1 }, { unique: true });
db.clinical_reference_rules.createIndex({ kind: 1, code: 1, status: 1, priority: -1 });
db.clinical_reference_rules.createIndex({ orgId: 1, kind: 1, code: 1, status: 1, priority: -1 });
```

## Boundaries

- `labs_ledger`/`labs_current` store observed lab data.
- `measurements_ledger`/`measurements_current` store observed activity/vitals data.
- `targets_ledger`/`targets_current` store goal state and target changes.
