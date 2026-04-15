```mermaid
erDiagram
  patients ||--o{ labs_ledger : "patientId"
  patients ||--o{ labs_current : "patientId"
  patients ||--o{ measurements_ledger : "patientId"
  patients ||--o{ targets_ledger : "patientId"
  patients ||--o{ targets_current : "patientId"
  patients ||--o{ patient_goals_current : "patientId"
  patients ||--o{ patient_goals_ledger : "patientId"
  patients ||--o{ care_plans : "patientId"
  clinical_reference_rules ||--o{ targets_current : "derivedFrom.ruleId/version"
  clinical_reference_rules ||--o{ targets_ledger : "derivedFrom.ruleId/version"
  clinical_reference_rules ||--o{ labs_ledger : "derivedFromRangeId/version"

  patients {
    ObjectId _id PK
    string orgId
  }

  clinical_reference_rules {
    ObjectId _id PK
    string ruleId
    number version
    string kind
    string code
    string status
    number priority
  }

  labs_ledger {
    ObjectId _id PK
    ObjectId patientId FK
    string code
    date takenAt
  }

  labs_current {
    ObjectId _id PK
    ObjectId patientId FK
    string code
    ObjectId ledgerId
  }

  measurements_ledger {
    ObjectId _id PK
    ObjectId patientId FK
    string kind
    string source
    object provider
    string externalRecordId
    object device
    date measuredAt
  }

  targets_ledger {
    ObjectId _id PK
    ObjectId patientId FK
    string domain
    string metric
    date createdAt
  }

  targets_current {
    ObjectId _id PK
    ObjectId patientId FK
    date updatedAt
  }

  patient_goals_current {
    ObjectId _id PK
    ObjectId patientId FK
    date updatedAt
  }

  patient_goals_ledger {
    ObjectId _id PK
    ObjectId patientId FK
    string goalCode
    date createdAt
  }

  care_plans {
    ObjectId _id PK
    ObjectId patientId FK
    string status
    date updatedAt
  }
```

> **ERD (Entity–Relationship Diagram):** a diagram showing entities (tables/collections) and their relationships.
> **Mermaid:** a plain‑text diagram syntax that renders to diagrams in Markdown‑friendly tools (e.g., GitHub, VS Code extensions, or static site generators that support Mermaid).
