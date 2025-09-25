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
- **Notes:** single latest value; historicals should live in a separate measurements ledger

### ACR (Albumin‑to‑Creatinine Ratio)

- **Location:** `UserClinical.acrCategory`
- **Type:** enum `A1|A2|A3`, nullable
- **Notes:** category only in baseline; raw labs belong in the measurements ledger
