# UserClinical (Sensitive Clinical Data)

**Purpose:** Kidney‑related clinical baseline and targets to drive nutrition/exercise guidance.
**Contains PII:** No direct PII; linked to `UserPII` by `userId`.
**Access:** Strict. Only the user (self), app server, and assigned clinicians (if applicable).
**Logging:** All reads/writes are audited (who/when/which user). Payloads are **not** logged.

## Fields (summary)

- `userId` · string · **FK → UserPII.id**
- `ckdStage` · 1|2|3|4|5|null (**CKD = Chronic Kidney Disease**)
- `egfrCurrent` · number|null (mL/min/1.73m²) (**eGFR = estimated Glomerular Filtration Rate**)
- `acrCategory` · `A1|A2|A3|null` (**ACR = Albumin‑to‑Creatinine Ratio**)
- `dialysisStatus` · enum (`none|hemodialysis|peritoneal|post-transplant`)
- `diagnoses` · array of { code?, label }
- `medications` · array of { name, dose?, frequency?, startedAt?, stoppedAt? }
- `allergies` · string[]
- `dietaryPreferences` · string[]
- `contraindications` · string[]
- `targets` · optional object of: caloriesKcal, proteinG, phosphorusMg, potassiumMg, sodiumMg, fluidMl
- `careTeam` · array of { role, name?, org?, contact? }
- `lastClinicalUpdateAt` · Date|null
- `createdAt` / `updatedAt`

## Retention

- Keep as long as necessary for care features or as required by policy/law. See `/docs/security/data-retention.md`.
