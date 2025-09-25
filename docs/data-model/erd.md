```mermaid
erDiagram
  %% Relationships
  UserPII ||--o| UserClinical : "userId (FK)"

  %% Entities
  UserPII {
    string id PK "Internal Primary Key"
    string email "Unique login email (PII)"
    string pseudonymId "Analytics ID (non-PII)"
    string timeZone
    string units
    string status
    date createdAt
    date updatedAt
  }

  UserClinical {
    string userId FK "Ref → UserPII.id"
    int ckdStage
    float egfrCurrent
    string acrCategory
    string dialysisStatus
    string[] allergies
    date lastClinicalUpdateAt
    date createdAt
    date updatedAt
  }

  %% Styling
  classDef pii fill:#f6f8fa,stroke:#0366d6,stroke-width:1px,color:#24292e;
  classDef clinical fill:#fff5f5,stroke:#d73a49,stroke-width:1px,color:#24292e;
  class UserPII pii;
  class UserClinical clinical;
```

> **ERD (Entity–Relationship Diagram):** a diagram showing entities (tables/collections) and their relationships.
> **Mermaid:** a plain‑text diagram syntax that renders to diagrams in Markdown‑friendly tools (e.g., GitHub, VS Code extensions, or static site generators that support Mermaid).
