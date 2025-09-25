# ADR‑0001: Split PII and Clinical Data

- **Status:** Accepted (2025‑09‑24)
- **Context:** Health data sensitivity; UK **GDPR (General Data Protection Regulation)** compliance; need for pseudonymised analytics.
- **Decision:** Two stores/collections: `UserPII` and `UserClinical`, linked by `userId` (internal **Primary Key (PK)**). Expose `pseudonymId` for analytics/research exports.
- **Consequences:**
  - **Pros:** Better security, clearer access control, easier exports/deletion.
  - **Cons:** Slight join complexity; more operational policy to maintain.
- **Notes:** All Clinical access is audited; analytics never receives PII.
