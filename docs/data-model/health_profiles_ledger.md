# health_profiles_ledger

This document defines `health_profiles_ledger` MongoDB collection.

Purpose:

- Persist structured allergies, dietary preferences, and terminology-backed conditions.
- Support append-only audit history for patient-entered and clinician-updated profile data.
- Replace free-text-only storage for coded health profile items over time.

This collection should be append-only. Historical entries should not be mutated in place except for controlled logical correction.

---

# Collection: `health_profiles_ledger`

## Scope

This ledger is intended to store:

- `allergy` entries
- `dietary_preference` entries
- `condition` entries

Examples:

- Food allergy with optional child allergen and severity
- Medication allergy selected from the medication autocomplete
- Environmental allergy from a controlled list
- Dietary preference selected from a fixed app-owned taxonomy
- Other condition selected from the NHS SNOMED CT terminology service

---

## Design principles

- Append-only
- Immutable event records
- Structured coded values where possible
- Patient and clinician edit auditability
- Support for current-state projection later

---

## Recommended companion projection

The ledger alone is good for audit, but the app will likely also need a fast read model.

Recommended later:

- `health_profiles_current`

Purpose of `health_profiles_current`:

- One current effective document per patient
- Fast reads for onboarding edit screens and dashboard/profile rendering
- Derived from the latest non-superseded ledger events

For now, this document only defines the ledger.

---

## Top-level schema

| Field          | Type               | Required | Description                                                      |
| -------------- | ------------------ | -------- | ---------------------------------------------------------------- |
| `_id`          | `ObjectId`         | ✅       | Mongo document id                                                |
| `orgId`        | `string`           | ❌       | Organisation id                                                  |
| `patientId`    | `ObjectId`         | ✅       | Patient id                                                       |
| `entryId`      | `string`           | ✅       | Stable logical id for one allergy/preference/condition           |
| `createdAt`    | `date`             | ✅       | Event timestamp                                                  |
| `createdBy`    | `object`           | ✅       | Actor who made the change                                        |
| `eventType`    | `string`           | ✅       | `created`, `updated`, `removed`, `restored`, `ledger_correction` |
| `before`       | `object \| null`   | ✅       | State before the event                                           |
| `after`        | `object \| null`   | ✅       | State after the event                                            |
| `correctionOf` | `ObjectId \| null` | ❌       | Prior event corrected by this event                              |
| `superseded`   | `boolean`          | ✅       | Default `false`                                                  |

At least one of `before` or `after` must be present.

---

## `createdBy`

| Field         | Type                                                             | Required |
| ------------- | ---------------------------------------------------------------- | -------- |
| `principalId` | `string`                                                         | ✅       |
| `actorType`   | `"patient" \| "clinician" \| "dietitian" \| "admin" \| "system"` | ✅       |
| `displayName` | `string \| null`                                                 | ❌       |

---

## `before` / `after` union

`before` and `after` represent one of three item kinds:

- `allergy`
- `dietary_preference`
- `condition`

### Allergy value

| Field                          | Type                                                              | Required | Notes                                           |
| ------------------------------ | ----------------------------------------------------------------- | -------- | ----------------------------------------------- |
| `kind`                         | `"allergy"`                                                       | ✅       | Discriminator                                   |
| `allergy.group`                | `"food" \| "medication" \| "environmental" \| "latex" \| "other"` | ✅       |                                                 |
| `allergy.label`                | `string`                                                          | ✅       | Human-readable label                            |
| `allergy.key`                  | `string`                                                          | ❌       | Controlled option key for non-medication groups |
| `allergy.childKey`             | `string`                                                          | ❌       | Optional nested food/environmental choice       |
| `allergy.childLabel`           | `string`                                                          | ❌       | Optional nested food/environmental choice label |
| `allergy.severity`             | `"mild" \| "moderate" \| "severe" \| "unknown"`                   | ✅       |                                                 |
| `allergy.notes`                | `string`                                                          | ❌       | Optional free text                              |
| `allergy.medicationCode`       | `string`                                                          | ❌       | For medication allergies                        |
| `allergy.medicationCodeSystem` | `"DM_D" \| "SNOMED_CT" \| "CUSTOM"`                               | ❌       | For medication allergies                        |
| `allergy.medicationRefId`      | `ObjectId`                                                        | ❌       | Optional internal drug ref                      |
| `allergy.dmplusdCode`          | `string`                                                          | ❌       | Optional dm+d                                   |
| `allergy.snomedCode`           | `string`                                                          | ❌       | Optional SNOMED code                            |

### Dietary preference value

| Field                     | Type                   | Required | Notes                   |
| ------------------------- | ---------------------- | -------- | ----------------------- |
| `kind`                    | `"dietary_preference"` | ✅       | Discriminator           |
| `dietaryPreference.key`   | enum                   | ✅       | Controlled app taxonomy |
| `dietaryPreference.label` | `string`               | ✅       | Display label           |

Suggested initial options:

- `vegetarian`
- `vegan`
- `pescatarian`
- `halal`
- `kosher`
- `gluten_free`
- `dairy_free`
- `egg_free`
- `nut_free`
- `soy_free`
- `low_salt`
- `low_sugar`
- `low_fat`
- `low_potassium`
- `low_phosphorus`
- `renal_friendly`
- `diabetic_friendly`

### Condition value

| Field                  | Type                                                | Required | Notes               |
| ---------------------- | --------------------------------------------------- | -------- | ------------------- |
| `kind`                 | `"condition"`                                       | ✅       | Discriminator       |
| `condition.code`       | `string`                                            | ✅       | Terminology code    |
| `condition.codeSystem` | `"SNOMED_CT" \| "CUSTOM"`                           | ✅       | Prefer `SNOMED_CT`  |
| `condition.label`      | `string`                                            | ✅       | Preferred term text |
| `condition.status`     | `"active" \| "inactive" \| "resolved" \| "unknown"` | ✅       |                     |
| `condition.notes`      | `string`                                            | ❌       | Optional comment    |

---

## Example events

### Food allergy created

```json
{
  "patientId": "65f0c2b8b3f0c2b8b3f0c2b8",
  "entryId": "hp_allergy_peanut_01",
  "createdAt": "2026-05-26T10:00:00.000Z",
  "createdBy": {
    "principalId": "pr_111111111111111111111111",
    "actorType": "patient"
  },
  "eventType": "created",
  "before": null,
  "after": {
    "kind": "allergy",
    "allergy": {
      "group": "food",
      "key": "peanuts",
      "label": "Peanuts",
      "severity": "moderate"
    }
  },
  "superseded": false
}
```

### Condition created from SNOMED CT search

```json
{
  "patientId": "65f0c2b8b3f0c2b8b3f0c2b8",
  "entryId": "hp_condition_709044004",
  "createdAt": "2026-05-26T10:05:00.000Z",
  "createdBy": {
    "principalId": "pr_111111111111111111111111",
    "actorType": "patient"
  },
  "eventType": "created",
  "before": null,
  "after": {
    "kind": "condition",
    "condition": {
      "code": "709044004",
      "codeSystem": "SNOMED_CT",
      "label": "Chronic kidney disease",
      "status": "active"
    }
  },
  "superseded": false
}
```

---

## Indexes

- Query: `{ orgId: 1, patientId: 1, createdAt: -1 }`
- Query by logical item: `{ patientId: 1, entryId: 1, createdAt: -1 }`
- Optional sparse: `{ correctionOf: 1 }`

If a `health_profiles_current` projection is added later, current-state reads should come from that projection rather than replaying the ledger on every request.

---

## Relationship to `users_clinical`

Current state in the app stores:

- allergies, dietary preferences, and terminology-backed conditions in `users_clinical`

Recommended direction:

- Move structured allergies and dietary preferences into `health_profiles_ledger`
- Store terminology-backed conditions there too
- Keep `users_clinical` for renal baseline fields such as CKD stage, dialysis status, eGFR, height, and weight
- Avoid duplicating the full structured profile long-term across two source-of-truth collections

---

## Route implications

Planned supporting routes:

- `GET /api/terminology/conditions/search`
  - Proxy to the NHS Terminology Server using server-side credentials
- `POST /api/health-profiles`
  - Create one or more ledger events
- `GET /api/health-profiles`
  - Read current effective values, ideally from a future `health_profiles_current` projection

The terminology server credentials should remain server-side only and must not be queried directly from the mobile app.
