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

---

`targets_reference`

A curated, versioned set of rule rows used to compute recommended targets for a patient.

## Typical usage

1. App gathers patient context (age, weight, CKD (chronic kidney disease) stage, dialysis modality, comorbidities, key labs, key medications).
2. Rules are matched by `appliesWhen`.
3. Conflicts are resolved by `priority` and specificity.
4. The result is a **recommended target set** which can be copied into `targets_current`.

## Document shape

### Top-level fields

| Field         |                                     Type | Required | Description                                                                    |
| ------------- | ---------------------------------------: | :------: | ------------------------------------------------------------------------------ |
| `_id`         |                               `ObjectId` |    ✅    | MongoDB document id.                                                           |
| `ruleId`      |                                 `string` |    ✅    | Stable identifier for idempotent upserts, e.g. `kdigo-2024-sodium-all-ckd-v1`. |
| `version`     |                                 `number` |    ✅    | Monotonically increasing version for the same `ruleId`.                        |
| `status`      | `"active" \| "deprecated" \| "disabled"` |    ✅    | Controls whether the rule can be selected by the engine.                       |
| `metric`      |                                 `string` |    ✅    | Metric key, e.g. `sodium_mg_day`, `protein_g_kg_day`.                          |
| `unit`        |                                 `string` |    ✅    | Units for the metric, e.g. `mg/day`, `g/kg/day`, `kcal/day`.                   |
| `appliesWhen` |                                 `object` |    ✅    | Matching conditions for this rule.                                             |
| `target`      |                                 `object` |    ✅    | Target definition (range, max, min, exact).                                    |
| `priority`    |                                 `number` |    ✅    | Higher wins when multiple rules match the same metric.                         |
| `source`      |                                 `object` |    ✅    | Guideline provenance (publisher, title, year, url, notes).                     |
| `notes`       |                                 `object` |    ❌    | User-facing explanation and safety notes.                                      |
| `createdAt`   |                                   `date` |    ✅    | When this rule version was created.                                            |
| `updatedAt`   |                                   `date` |    ✅    | When this rule version was last updated.                                       |

### `appliesWhen`

`appliesWhen` is intentionally flexible. Keep it **bounded** to a known set of keys so you can index/query and validate consistently.

Recommended keys (v1):

| Field            |                                                        Type | Required | Description                                                          |
| ---------------- | ----------------------------------------------------------: | :------: | -------------------------------------------------------------------- |
| `ckdStage`       | `"1" \| "2" \| "3a" \| "3b" \| "4" \| "5" \| "any" \| null` |    ❌    | Stage selector.                                                      |
| `dialysis`       |         `"none" \| "hemodialysis" \| "peritoneal" \| "any"` |    ❌    | Dialysis modality selector.                                          |
| `ageMin`         |                                                    `number` |    ❌    | Inclusive minimum age.                                               |
| `ageMax`         |                                                    `number` |    ❌    | Inclusive maximum age.                                               |
| `sex`            |                               `"male" \| "female" \| "any"` |    ❌    | If needed.                                                           |
| `diabetes`       |                                           `boolean \| null` |    ❌    | Match on diabetes status.                                            |
| `pregnancy`      |                                           `boolean \| null` |    ❌    | Match pregnancy rules (if supported).                                |
| `labConstraints` |                                                    `object` |    ❌    | Optional, e.g. `{ "potassiumHigh": true }` derived from latest labs. |
| `medConstraints` |                                                    `object` |    ❌    | Optional, e.g. `{ "onAceInhibitor": true }`.                         |

### `target`

| Field              |                                   Type | Required | Description                         |
| ------------------ | -------------------------------------: | :------: | ----------------------------------- |
| `type`             | `"range" \| "max" \| "min" \| "exact"` |    ✅    | Target type.                        |
| `low`              |                       `number \| null` |    ❌    | Low bound (for `range`).            |
| `high`             |                       `number \| null` |    ❌    | High bound (for `range`).           |
| `value`            |                       `number \| null` |    ❌    | Used for `max`, `min`, or `exact`.  |
| `basis`            |    `"perDay" \| "perKgPerDay" \| null` |    ❌    | Optional basis metadata.            |
| `calculationNotes` |                       `string \| null` |    ❌    | Notes like “use ideal body weight”. |

### `source`

| Field         |             Type | Required | Description                                    |
| ------------- | ---------------: | :------: | ---------------------------------------------- |
| `publisher`   |         `string` |    ✅    | e.g. KDIGO, KDOQI.                             |
| `title`       |         `string` |    ✅    | Source title.                                  |
| `year`        |         `number` |    ✅    | Publication year.                              |
| `url`         | `string \| null` |    ❌    | Source link.                                   |
| `excerptHash` | `string \| null` |    ❌    | Optional integrity anchor for a short excerpt. |
| `note`        | `string \| null` |    ❌    | Any curation notes.                            |

## Indexes (recommended)

- Unique: `{ ruleId: 1, version: 1 }`
- Query: `{ metric: 1, status: 1, priority: -1 }`
- Optional: `{ "appliesWhen.ckdStage": 1, "appliesWhen.dialysis": 1, status: 1 }`

## Priority strategy

`priority` is an **internal rule-engine weight** used to deterministically pick the winning rule when multiple active rules match the same `metric`.

- `priority` is set **when authoring rules** in `targets_reference`.
- Clients (mobile/web) **must not** send or modify `priority`.
- The engine selects the rule with the **highest** `priority`.

### How to set priority

Set `priority` primarily by **specificity** and **clinical intent**:

- More specific rules (e.g., dialysis modality, narrow CKD stage, or lab-constrained) should have higher priority.
- General defaults should have lower priority.

Recommended bands (v1):

| Priority band | Intended use                                                           |
| ------------: | ---------------------------------------------------------------------- |
|         `0–9` | Fallback defaults / safe baselines                                     |
|       `10–29` | General CKD rules (broad applicability)                                |
|       `30–49` | Stage-specific rules (e.g., CKD 4–5)                                   |
|       `50–69` | Dialysis-specific rules (hemodialysis / peritoneal)                    |
|       `70–89` | Lab-constrained rules (based on latest labs-derived constraints)       |
|       `90–99` | Rare “hard preference” rules (use sparingly; requires clinical review) |

Example for a single `metric`:

- General CKD rule: `priority: 20`
- CKD stage 4–5 rule: `priority: 40`
- Hemodialysis rule: `priority: 60`
- Lab-constrained adjustment: `priority: 75`

### Deterministic tie-breakers

If two matching rules have the same `priority`, apply deterministic tie-breakers (in order):

1. Higher `version` wins
2. If still tied, higher `updatedAt` wins

This makes recommendations reproducible and auditable.

Engine selection order:

```ts
// highest wins
sortBy(priority DESC, version DESC, updatedAt DESC)
```

### Governance

Changing a rule’s `priority` is a **behavior change** (it can change which recommendation wins). Treat it like:

- a version bump (`version += 1`)
- a change that must be reviewed (clinical + product)

Do not “hot edit” priority on an existing version.

## How the engine searches for a target

When generating a recommended target for a patient, the engine performs a deterministic multi-step search against `targets_reference`.

### Step 1 — Build patient context

From `targets_current` inputs and patient profile, construct a context object such as:

```ts
{
  metric: "protein_g_kg_day",
  ckdStage: "4",
  dialysis: "hemodialysis",
  age: 62,
  sex: "male",
  diabetes: true,
  labFlags: { potassiumHigh: false }
}
```

Only fields defined in `appliesWhen` are considered during rule matching.

---

### Step 2 — Filter candidate rules

Query for rules that:

- `metric` matches exactly
- `status` === "active"
- `appliesWhen` conditions match patient context

Example MongoDB query pattern (simplified):

```ts
const candidates = await db.targets_reference.find({
  metric: "protein_g_kg_day",
  status: "active",
});
```

Then apply in-code filtering for:

- CKD stage match (`ckdStage === "any"` OR exact match)
- Dialysis match (`"any"` OR exact match)
- Age within `ageMin`/`ageMax`
- Optional boolean matches (e.g., diabetes, pregnancy)
- Optional lab/med constraint matches

---

### Step 3 — Resolve conflicts deterministically

If multiple rules match:

```ts
candidates.sort(
  by priority DESC,
  then version DESC,
  then updatedAt DESC
)
```

The first rule becomes the selected rule.

---

### Step 4 — Produce recommended target

The selected rule’s `target` object is returned as the **system recommendation**.

This recommendation may then:

- Be written to `targets_current`
- Be logged in `targets_ledger` as `system_recommended_target`

---

## Important Design Notes

- The engine should never "partially merge" multiple rules.
- Exactly one rule wins per `metric`.
- If no rule matches, fall back to a safe default (priority band `0–9`).
- Rule evaluation must be deterministic for audit reproducibility.

This ensures every recommendation can be traced back to a single `ruleId` and `version`.

## Example document

```json
{
  "ruleId": "kdigo-2024-sodium-all-ckd-v1",
  "version": 1,
  "status": "active",
  "metric": "sodium_mg_day",
  "unit": "mg/day",
  "appliesWhen": {
    "ckdStage": "any",
    "dialysis": "any",
    "ageMin": 18,
    "ageMax": 150
  },
  "target": { "type": "max", "value": 2000, "basis": "perDay" },
  "priority": 50,
  "source": {
    "publisher": "KDIGO",
    "title": "CKD guideline executive summary",
    "year": 2024,
    "url": null,
    "note": "Guideline-derived default; allow clinician override."
  },
  "notes": {
    "userFacing": "Aim for less than 2,000 mg sodium per day unless your renal team advises otherwise.",
    "safety": [
      "Do not apply aggressive sodium restriction without clinical context."
    ]
  },
  "createdAt": { "$date": "2026-02-25T00:00:00.000Z" },
  "updatedAt": { "$date": "2026-02-25T00:00:00.000Z" }
}
```
