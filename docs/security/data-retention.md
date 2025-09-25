# Data Retention & Deletion

## Principles

- **Minimisation:** collect only what’s needed.
- **Separation:** keep PII and Clinical split.
- **User rights:** honour access/export/delete requests per **GDPR (General Data Protection Regulation)**.

## Defaults (proposed)

- **PII:** purge within 30 days of account deletion. Backups age out per infra policy.
- **Clinical:** retain while features require it or as mandated by policy/law; document any statutory periods here.
- **Logs:** keep access audit logs for 12 months; do not store payloads.

## Environments

- **Production → lower env:** use synthetic or anonymised data only. No production snapshots in dev.
