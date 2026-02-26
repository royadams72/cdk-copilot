# Field Dictionary (selected fields)

### email

- **Location:** `UserPII.email`
- **Type:** string (email), unique
- **Sensitivity:** PII (Personally Identifiable Information)
- **Validation:** lower‑cased; required on create
- **Notes:** never expose in analytics/research; use `pseudonymId` instead

### pseudonymId

- **Location:** `UserPII.pseudonymId`
- **Type:** string, unique
- **Sensitivity:** Non‑PII identifier used for analytics/research joins
- **Notes:** generated server‑side; never reversible to PII in analytics stores

### eGFR (estimated Glomerular Filtration Rate)

- **Location:** `UserClinical.egfrCurrent`
- **Type:** number (0–200), nullable
- **Units:** mL/min/1.73m²
- **Notes:** single latest value; historicals should live in `labs_ledger`

### ACR (Albumin‑to‑Creatinine Ratio)

- **Location:** `UserClinical.acrCategory`
- **Type:** enum `A1|A2|A3`, nullable
- **Notes:** category only in baseline; raw labs belong in the labs ledger

### targets.current

- **Location:** `targets_current.targets[*].effective`
- **Type:** object (`type`, `low?`, `high?`, `value?`, `basis?`)
- **Notes:** effective target after override resolution (`override ?? recommended`)

### measurements.value

- **Location:** `measurements_ledger` (kind-specific fields like `count`, `valueKg`)
- **Type:** numeric observation payload
- **Notes:** observed fact only, never a target/goal

### clinical reference rule

- **Location:** `clinical_reference_rules`
- **Type:** versioned rule row with `kind`, `code`, `appliesWhen`, `rule`, `priority`
- **Notes:** replaces separate documented reference sources (`targets_reference`,
  `labs_reference_ranges`)
