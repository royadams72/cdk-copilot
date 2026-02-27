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

## Summary

`clinical_reference_rules` is the _reference layer_ for any rule that:

- interprets an observed value (for example, lab result ranges like normal/high/low)
- recommends a target (for example, daily sodium maximum, protein range, blood pressure range)

Rules are:

- **versioned** (`ruleId` + `version`)
- **scoped** (global rules have `orgId: null`, organisation overrides set `orgId`)
- **selected deterministically** (priority → version → updatedAt)
- **traceable** (downstream ledger rows store `derivedFromRuleId` + `derivedFromRuleVersion` snapshots)

## Collection

`clinical_reference_rules`

## Fields

| Field                     |                                                   Type |        Required         | Notes                                                                                                                              |
| ------------------------- | -----------------------------------------------------: | :---------------------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| `_id`                     |                                               ObjectId |           ✅            | MongoDB document id.                                                                                                               |
| `ruleId`                  |                                                 string |           ✅            | Stable identifier for the logical rule across versions (for example, a UUID or slug). Unique together with `version`.              |
| `version`                 |                                           number (int) |           ✅            | Monotonic version per `ruleId`. Increment when the rule logic or thresholds change.                                                |
| `status`                  |                 "active" \| "inactive" \| "deprecated" |           ✅            | Only `active` rules should be selected for derivations/recommendations.                                                            |
| `kind`                    |    "lab_range" \| "clinical_target" \| "health_target" |           ✅            | `lab_range` = interpretation ranges for observed labs. `clinical_target/health_target` = target recommendations.                   |
| `code`                    |                                                 string |           ✅            | Canonical code for what the rule is about (for example, `loinc:4548-4` or `sodium_mg_day`). Used for matching.                     |
| `unit`                    |                                         string \| null |           ✅            | Canonical unit for the rule (for example, `mmol/mol`, `mg/day`). Null allowed if unit is implicit in `code` but still recommended. |
| `orgId`                   |                                         string \| null |           ✅            | `null` = global/default rule. Set to an organisation id to override or add org-specific rules.                                     |
| `appliesWhen`             |                                                 object |           ✅            | Match constraints. Use explicit values or `"any"` to indicate no constraint for that dimension.                                    |
| `appliesWhen.ckdStage`    |      "any" \| "1" \| "2" \| "3a" \| "3b" \| "4" \| "5" |           ✅            | Rule applicability by chronic kidney disease (CKD) stage. Keep as string for consistent matching.                                  |
| `appliesWhen.dialysis`    |                                 "any" \| "yes" \| "no" |           ✅            | Dialysis applicability.                                                                                                            |
| `appliesWhen.sex`         |                            "any" \| "female" \| "male" |           ✅            | Sex applicability.                                                                                                                 |
| `appliesWhen.ageMin`      |                                                 number |           ✅            | Minimum age inclusive.                                                                                                             |
| `appliesWhen.ageMax`      |                                                 number |           ✅            | Maximum age inclusive.                                                                                                             |
| `priority`                |                                           number (int) |           ✅            | Higher wins. Use this to make org overrides or more specific guidance win over generic rules.                                      |
| `rule`                    |                                                 object |           ✅            | Kind-specific payload; see below.                                                                                                  |
| `rule.range`              |                                                 object |          ⛔️\*           | Present only when `kind = "lab_range"`. Contains interpretation thresholds.                                                        |
| `rule.range.lower`        |                                         number \| null |           ⛔️            | Lower bound for “normal” (inclusive). Null = no lower bound.                                                                       |
| `rule.range.upper`        |                                         number \| null |           ⛔️            | Upper bound for “normal” (inclusive). Null = no upper bound.                                                                       |
| `rule.range.criticalLow`  |                                         number \| null |           ⛔️            | Critical low threshold (inclusive). Null = not defined.                                                                            |
| `rule.range.criticalHigh` |                                         number \| null |           ⛔️            | Critical high threshold (inclusive). Null = not defined.                                                                           |
| `rule.target`             |                                                 object |          ⛔️\*           | Present only when `kind = "clinical_target"` or `"health_target"`.                                                                 |
| `rule.target.type`        |                   "max" \| "min" \| "range" \| "exact" | ✅ (when `rule.target`) | `max` uses `value`; `min` uses `value`; `range` uses `low`/`high`; `exact` uses `value`.                                           |
| `rule.target.value`       |                                         number \| null |           ⛔️            | Numeric target value (for `max`/`min`/`exact`).                                                                                    |
| `rule.target.low`         |                                         number \| null |           ⛔️            | Lower bound for `range`.                                                                                                           |
| `rule.target.high`        |                                         number \| null |           ⛔️            | Upper bound for `range`.                                                                                                           |
| `rule.target.basis`       | "perDay" \| "perWeek" \| "perKg" \| "absolute" \| null |           ⛔️            | How to interpret the number. Example: sodium `perDay`, protein `perKg`.                                                            |
| `source`                  |                                                 object |           ✅            | Provenance for the rule (guideline/paper/site).                                                                                    |
| `source.publisher`        |                                         string \| null |           ✅            | Publisher/organisation (for example, KDIGO, NICE).                                                                                 |
| `source.title`            |                                         string \| null |           ✅            | Human title for the source.                                                                                                        |
| `source.year`             |                                         number \| null |           ✅            | Publication year.                                                                                                                  |
| `source.url`              |                                         string \| null |           ✅            | Link for internal auditing; can be null if not stored.                                                                             |
| `source.note`             |                                         string \| null |           ✅            | Any internal note (for example, “adapted for org X”).                                                                              |
| `createdAt`               |                                         ISODate string |           ✅            | Document created timestamp.                                                                                                        |
| `updatedAt`               |                                         ISODate string |           ✅            | Document last updated timestamp.                                                                                                   |

\* Required conditionally based on `kind`.

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

### Examples

**Lab range (interpretation) example**

```json
{
  "ruleId": "loinc-4548-4-adult-any",
  "version": 1,
  "status": "active",
  "kind": "lab_range",
  "code": "loinc:4548-4",
  "unit": "mmol/mol",
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
    "range": {
      "lower": null,
      "upper": 41,
      "criticalLow": null,
      "criticalHigh": 86
    }
  },
  "source": {
    "publisher": "Example",
    "title": "Example source",
    "year": 2024,
    "url": null,
    "note": null
  }
}
```

**Clinical target example**

```json
{
  "ruleId": "sodium-mg-day-default",
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
  "rule": { "target": { "type": "max", "value": 2000, "basis": "perDay" } },
  "source": {
    "publisher": "Example",
    "title": "Example source",
    "year": 2024,
    "url": null,
    "note": null
  }
}
```

## Deterministic selection

When multiple rules could apply (for example, a global default and an org override), selection must be deterministic.

**Candidate filtering**

- `status` must be `"active"`
- `kind` and `code` must match the request
- `orgId` is matched as:
  - prefer `{ orgId: <orgId> }` rules
  - else fall back to `{ orgId: null }` (global defaults)
- `appliesWhen` must match the patient context; any dimension may be `"any"`

**Ranking (tie-breakers)**

1. highest `priority`
2. highest `version`
3. latest `updatedAt`

If all tie-breakers are still equal, treat it as a data-quality error (duplicate rules) and fail closed in derivations.

## Indexes

```js
db.clinical_reference_rules.createIndex(
  { ruleId: 1, version: 1 },
  { unique: true },
);
db.clinical_reference_rules.createIndex({
  kind: 1,
  code: 1,
  status: 1,
  priority: -1,
});
db.clinical_reference_rules.createIndex({
  orgId: 1,
  kind: 1,
  code: 1,
  status: 1,
  priority: -1,
});
```

## Boundaries

- `labs_ledger`/`labs_current` store observed lab data.
- `measurements_ledger` stores observed activity/vitals data.
- `targets_ledger`/`targets_current` store goal state and target changes.
