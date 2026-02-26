# labs_reference_ranges (Deprecated)

`labs_reference_ranges` documentation has been superseded by
`clinical_reference_rules`.

Use [clinical_reference_rules.md](./clinical_reference_rules.md) for all new
reference/rules modelling.

## Migration note

- Old `labs_reference_ranges.loincCode` maps to
  `clinical_reference_rules.code`
- Range rows map to `kind = "lab_range"` and use `rule.range`
- Keep `labs_ledger` and `labs_current` unchanged as runtime lab data

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
    •	eGFR CKD staging thresholds: NHS Chronic Kidney Disease diagnosis guidance and Kidney Care UK.  [text](https://www.nhs.uk/conditions/kidney-disease/diagnosis/)
