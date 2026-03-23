# CKD Copilot — Docs

This folder contains developer documentation for **CKD Copilot**. It covers the **data model split** between **Personally Identifiable Information (PII)** and **Clinical data**, **Role‑Based Access Control (RBAC)**, **data retention**, and the **Entity–Relationship Diagram (ERD)** in Mermaid format.

## Structure

```
/docs
  /data-model
    pii.md
    clinical.md
    dictionary.md
    erd.mmd
  /security
    rbac.md
    data-retention.md
  /adr
    ADR-0001-split-pii-clinical.md
```

## Data model

- [UserPII (Personally Identifiable Information)](./data-model/pii.md)
- [UserClinical (Clinical data)](./data-model/clinical.md)
- [Field dictionary](./data-model/dictionary.md)
- [ERD (Entity–Relationship Diagram) — Mermaid](./data-model/erd.mmd)
- [Nutrition ledger](./data-model/nutrition_ledger.md)
- [Food taxonomy](./data-model/food_taxonomy.md)
- [Patient goals current](./data-model/patient_goals_current.md)
- [Patient goals ledger](./data-model/patient_goals_ledger.md)
- [Weekly nutrition insights](./data-model/weekly_nutrition_insights.md)

## Security

- [RBAC (Role-Based Access Control)](./security/rbac.md)
- [Data retention](./security/data-retention.md)

## Architecture decisions

- [ADR-0001: Split PII and Clinical](./adr/ADR-0001-split-pii-clinical.md)

## Sources of truth

- **Validation & shapes**: Zod schemas in code.
- **API specification**: generated OpenAPI (optional future step).
- **Docs**: these Markdown files + Mermaid for the ERD.
