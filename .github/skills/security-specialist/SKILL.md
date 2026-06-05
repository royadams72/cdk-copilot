---
name: security-specialist
description: "Conduct comprehensive NHS-focused security audit of CKD Copilot: auth, data handling, GDPR compliance, secrets, validation. Produces SECURITY_AUDIT.md report."
---

# NHS Security Specialist

Conduct a comprehensive security audit of CKD Copilot as an NHS-focused cybersecurity specialist. Analyzes authentication, data privacy, compliance, secrets management, and data protection. Produces a structured `SECURITY_AUDIT.md` report.

## What this does

1. **Deep code analysis** across auth flows, data handling, compliance, and security controls
2. **NHS compliance verification**: GDPR, audit trails, pseudonymization, consent
3. **Data privacy audit**: PII/Clinical split, access controls, pseudonymId usage
4. **Secrets scanning**: hardcoded secrets, .env management, SecureStore
5. **Input validation**: Zod schema coverage, injection risks
6. **Mobile security**: Health Connect, transmission, storage
7. **Sensitive data leakage**: console logs, error messages, API responses

## Audit scope

### Authentication & Authorization

- JWT generation, validation, refresh flows (apps/api/lib/auth/)
- `requireUser()` enforcement on protected endpoints
- Scope validation (`neededScopes` coverage)
- Role-based access control (patient, clinician, dietitian, admin)
- Auth bypass risks

### Data Privacy & Handling

- PII/Clinical split verification (users_pii vs users_clinical)
- Pseudonymization in analytics (`pseudonymId` isolation)
- Clinical data access audit (read/write permissions)
- Data flow from mobile → API → MongoDB
- RTK Query data persistence

### NHS Compliance

- Audit logging for clinical mutations
- GDPR consent mechanism
- Data retention policies
- Right-to-be-forgotten implementation
- Data processing agreements

### Secrets Management

- Hardcoded secrets in code
- .gitignore enforcement for .env.local
- SecureStore JWT storage
- Environment variable overexposure
- Vercel/deployment secrets

### Input Validation

- Zod schema validation completeness
- MongoDB query injection risks
- API request validation
- Mobile form validation
- Error message sanitization

### Mobile Security

- Health Connect permission scope
- Data storage (expo-secure-store, Redux)
- Token refresh on 401
- HTTPS enforcement
- Debugging/devtools exposure

### Sensitive Data Leakage

- console.log of PII/clinical data
- Error messages revealing information
- API response envelope safety
- Redux devtools in production
- Network request logging

## Report format

Produces `SECURITY_AUDIT.md` at repo root with:

```
# Security Audit Report

**Generated:** [timestamp]
**Risk Level:** [LOW|MEDIUM|HIGH|CRITICAL]
**Findings:** N items

## Executive Summary
[Overview of top concerns]

## 1. Authentication & Authorization
- ✅ / ⚠️ / ❌ Status
- Finding description
- **File:** path/to/file.ts:lineNo
- **Severity:** [CRITICAL|HIGH|MEDIUM|LOW]
- **Recommendation:** [Action]

[Repeat for each finding]

## 2. Data Privacy & Handling
...

## 3. NHS Compliance
...

## 4. Secrets Management
...

## 5. Input Validation
...

## 6. Mobile Security
...

## 7. Sensitive Data Leakage
...

## Remediation Checklist
- [ ] [CRITICAL] Finding 1
- [ ] [HIGH] Finding 2
...

## Compliance Status
- GDPR: [✅|❌]
- NHS standards: [✅|❌]
- Data protection: [✅|❌]
```

### Severity levels

- **CRITICAL**: Immediate security risk, data exposure, auth bypass, compliance violation
- **HIGH**: Significant vulnerability, weak encryption, missing critical validation
- **MEDIUM**: Best-practice gap, incomplete audit trail, hardening needed
- **LOW**: Documentation, hardening suggestion, defense-in-depth improvement

## Investigation approach

1. Map auth system: trace JWT flow, requireUser() calls, scope enforcement
2. Trace data flows: identify all PII/clinical data touch points across mobile→API→DB
3. Audit MongoDB schemas and access patterns
4. Review validation (Zod schemas, input sanitization)
5. Check mobile storage and transmission security
6. Scan for secrets and sensitive data in code
7. Verify audit logging and compliance controls
8. Check error messages and logs for information leakage

## How to use

From VS Code Claude Code:

```
/security-specialist
```

The agent will:

- Explore your codebase for security patterns
- Produce a comprehensive audit report
- Flag issues with file paths and severity levels
- Provide remediation steps
