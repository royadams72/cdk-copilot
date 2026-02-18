labs_reference_ranges Collection

Purpose

Stores dynamic laboratory reference ranges used to evaluate patient lab results.

This collection allows:
• Age-specific ranges
• Sex-specific ranges
• Unit validation
• Organisation-level overrides
• Future support for calculated tests

⸻

Collection: labs_reference_ranges

Document Structure

```js
{
  _id: ObjectId,

  // Identification
  loincCode: string,          // Standard test identifier
  testName: string,           // Human-readable label
  category: string,           // e.g. "renal", "electrolyte", "diabetes"

  // Units
  unit: string,               // e.g. "µmol/L", "mmol/L", "g/L"

  // Demographic filters
  sex: "male" | "female" | "any",
  ageMin: number,             // inclusive
  ageMax: number,             // inclusive

  // Reference boundaries
  lower: number | null,
  upper: number | null,

  // Optional critical thresholds
  criticalLow?: number,
  criticalHigh?: number,

  // Behaviour type
  referenceType: "absolute" | "calculated",

  // Organisation override
  orgId?: string,             // null = system default

  // Metadata
  source: "uk_default" | "custom" | "imported",
  version: number,
  createdAt: Date,
  updatedAt: Date
}
```

## Field Explanation

- `loincCode` Links to the standard lab test identifier
- `unit` Must match the unit stored in labs_results
- `sex` Allows sex-based reference ranges
- `ageMin / ageMax` Enables paediatric/adult separation
- `lower / upper` Normal range boundaries
- `criticalLow / criticalHigh` Optional urgent thresholds
- `referenceType` absolute = static range, calculated = computed logic
- `orgId` If present, overrides system default for that organisation
- `version` Allows safe updates to ranges over time

## Required Indexes

```js
[
  { key: { loincCode: 1, unit: 1, sex: 1, ageMin: 1, ageMax: 1 } },
  { key: { orgId: 1 } },
  { key: { category: 1 } },
];
```

### Optional uniqueness constraint (recommended):

```js
{
  key: { loincCode: 1, unit: 1, sex: 1, ageMin: 1, ageMax: 1, orgId: 1 },
  options: { unique: true }
}
```

## Example Documents

## Example 1 — Creatinine (Adult Male)

```js
{
  loincCode: "2160-0",
  testName: "Serum Creatinine",
  category: "renal",
  unit: "µmol/L",
  sex: "male",
  ageMin: 18,
  ageMax: 150,
  lower: 64,
  upper: 104,
  criticalLow: null,
  criticalHigh: 300,
  referenceType: "absolute",
  source: "uk_default",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
}
```

⸻

## Example 2 — Potassium (All Adults)

```js
{
  loincCode: "2823-3",
  testName: "Potassium",
  category: "electrolyte",
  unit: "mmol/L",
  sex: "any",
  ageMin: 18,
  ageMax: 150,
  lower: 3.5,
  upper: 5.0,
  criticalLow: 2.5,
  criticalHigh: 6.5,
  referenceType: "absolute",
  source: "uk_default",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
}
```

## Lookup Logic

### When a lab result is inserted:

1. Determine patient:

- • Age
- • Sex
- • Organisation

2. Query:

```js
findOne({
  loincCode,
  unit,
  sex: { $in: [patient.sex, "any"] },
  ageMin: { $lte: patient.age },
  ageMax: { $gte: patient.age },
  orgId: { $in: [patient.orgId, null] },
});
```

3. Compare value to lower and upper

```js
{
  status: "low" | "normal" | "high" | "critical",
  reference: { lower, upper }
}
```

## Design Decisions

## Why store ranges separately?

- • Avoids hardcoding logic
- • Allows safe updates
- • Enables organisation overrides
- • Keeps lab result documents lightweight

## Why use LOINC?

## Ensures:

- • Standardised identifiers
- • Interoperability with NHS/FHIR systems
- • Future integration compatibility

## Where each of the default ranges came from (for traceability)

    •	Creatinine male/female adult ranges: NHS lab pages.  ￼[text](https://www.nbt.nhs.uk/severn-pathology/requesting/test-information/creatinine)
    •	Sodium adult range: NHS lab page.  ￼[text](https://www.nbt.nhs.uk/severn-pathology/requesting/test-information/sodium)
    •	Potassium adult range: NHS lab page (note upper varies by lab; this uses 5.3).  ￼[text](https://www.southtees.nhs.uk/services/pathology/tests/potassium/)
    •	Phosphate adult range: NHS lab page.  ￼[text](https://www.nbt.nhs.uk/severn-pathology/requesting/test-information/phosphate)
    •	Adjusted calcium adult range: NHS lab page.  ￼[text](https://www.nbt.nhs.uk/severn-pathology/requesting/test-information/calcium)
    •	Albumin adult range: NHS lab page.  ￼[text](https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/bicarbonate-hco3-co2)
    •	Bicarbonate adult range: NHS lab page.  ￼[text](https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/bicarbonate-hco3-co2)
    •	Urea adult range: NHS lab page.  [text](https://www.nbt.nhs.uk/severn-pathology/requesting/test-information/)￼
    •	Haemoglobin adult ranges: NHS lab page.  ￼[text](https://www.nbt.nhs.uk/severn-pathology/requesting/test-information/haemoglobin)
    •	uACR categories A1/A2/A3: NHS kidney disease diagnosis page and Kidney Care UK explainer.  ￼[text](https://www.nhs.uk/conditions/kidney-disease/diagnosis)
    •	HbA1c thresholds (normal/prediabetes/diabetes): Diabetes UK.  ￼[text](https://www.diabetes.org.uk/about-diabetes/looking-after-diabetes/hba1c)
