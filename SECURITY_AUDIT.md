# CKD Copilot Security Audit Report

**Audit Date:** June 3, 2026  
**Scope:** Full codebase security review (API, Mobile, Core packages)  
**Compliance Focus:** GDPR, NHS Data Protection, OWASP Top 10  
**Overall Risk Level:** HIGH  
**Critical Vulnerabilities:** 1  
**High Severity Findings:** 5  
**Medium Severity Findings:** 4  
**Low Severity Findings:** 3

---

## Executive Summary

CKD Copilot is an NHS health management platform with a Next.js API backend and Expo/React Native mobile client. This audit identified **1 critical authorization vulnerability**, **5 high-severity issues**, and several medium/low findings that require immediate remediation before production deployment.

**Key Concerns:**

- Broken authorization in user PII endpoint allows unauthorized data modification
- Sensitive error logging and debugging statements could leak system/clinical data
- Incomplete audit logging for clinical data mutations (NHS compliance risk)
- Role-based scope inconsistencies between auth layers
- Console logging in mobile app could expose sensitive information

---

## 1. Authentication & Authorization

### 1.1 CRITICAL: Authorization Bypass in User PII Update Endpoint

**Status:** VULNERABILITY

**Finding:**  
The `/users/pii/[userId]` endpoint performs no authorization check on the `userId` parameter. A caller with the `users:pii:write` scope can modify ANY user's PII, not just their own.

**File:** `/Users/royadams/Sites/ckd-copilot/apps/api/app/api/users/pii/[userId]/route.ts` (lines 36-88)

**Code Snippet:**

```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const requestId = makeRandomId();
  try {
    const { userId } = await params;
    const caller = await requireUser(req, ["users:pii:write"]);  // Only checks scope
    const body = await req.json();

    // ... validation ...

    const database = await getDb();
    const res = await database.collection("users_pii").updateOne(
      { userId },  // ⚠️ NO AUTHORIZATION CHECK - updates ANY user!
      { $set: { ...parsed.data, updatedAt: new Date() } },
      { upsert: false }
    );
```

**Attack Scenario:**

1. User A obtains a valid JWT with `users:pii:write` scope
2. User A sends PATCH to `/api/users/pii/user-b-id` with malicious data
3. System allows modification without verifying User A is modifying their own record

**Severity:** CRITICAL  
**CVSS Score:** 8.1 (High)  
**Remediation:**

1. Add authorization check to verify `userId` matches caller's `principalId` or `patientId`:

```typescript
const caller = await requireUser(req, ["users:pii:write"]);
if (caller.patientId !== userId) {
  return bad("Unauthorized", { requestId }, 403);
}
```

2. Use consistent field names across endpoints (either `patientId` or `userId`)
3. Add integration tests to verify cross-user modification is rejected

**NHS Impact:** Potential breach of patient confidentiality and data integrity requirements

---

### 1.2 HIGH: Inconsistent Role-Based Scopes Between Modules

**Status:** WARNING/INCONSISTENCY

**Finding:**  
Role-based scopes are defined in two conflicting locations with different values:

**Location 1 - Auth Layer:** `/Users/royadams/Sites/ckd-copilot/apps/api/lib/auth/auth_requireUser.ts` (lines 37-41)

```typescript
export const ROLE_SCOPES: Record<string, Scope[]> = {
  admin: [], // ⚠️ EMPTY - should have all scopes
  clinician: [SCOPES.USERS_CLINICAL_READ],
  patient: [SCOPES.PATIENTS_READ, SCOPES.PATIENTS_FLAGS_WRITE],
};
```

**Location 2 - Core Types:** `/Users/royadams/Sites/ckd-copilot/packages/core/src/isomorphic/constants/scopes.ts` (lines 48-81)

```typescript
export const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  patient: [...8 scopes...],
  clinician: [...10 scopes...],
  dietitian: [...7 scopes...],
  admin: Object.values(SCOPES),  // ✓ Correct
};
```

**Issues:**

- Admin scopes are empty in `auth_requireUser.ts`, potentially breaking admin functionality
- Clinician scopes differ between modules (1 scope vs 10 scopes)
- The auth module doesn't include `dietitian` role

**Severity:** HIGH  
**Remediation:**

1. Remove duplicate `ROLE_SCOPES` definition from `auth_requireUser.ts`
2. Import `ROLE_SCOPES` from `@ckd/core` in auth module
3. Add unit test to verify scope assignments for all roles:

```typescript
it("all roles should have consistent scopes", () => {
  expect(ROLE_SCOPES.admin.length).toBeGreaterThan(0);
  expect(ROLE_SCOPES.clinician.length).toBe(10);
});
```

---

### 1.3 HIGH: Insufficient JWT Error Logging Could Leak Secrets

**Status:** SENSITIVE LOGGING

**Finding:**  
JWT verification errors are logged with full error details, which could leak cryptographic or system information.

**File:** `/Users/royadams/Sites/ckd-copilot/apps/api/lib/auth/auth_requireUser.ts` (line 75)

**Code:**

```typescript
try {
  const result = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  claims = result.payload as Record<string, any>;
} catch (err) {
  console.error("jwtVerify failed", err); // ⚠️ Logs full error with stack
  throw Object.assign(
    new Error(err instanceof Error ? err.message : "Unauthorized"),
    { status: 401 },
  );
}
```

**Severity:** HIGH  
**Remediation:**

```typescript
} catch (err) {
  // Log sanitized error for debugging only
  console.error("jwtVerify failed", {
    status: 401,
    errorType: err instanceof Error ? err.constructor.name : typeof err
  });
  throw Object.assign(
    new Error("Unauthorized"),  // Sanitized message to client
    { status: 401 },
  );
}
```

---

### 1.4 Token Expiration Configuration

**Status:** COMPLIANT

**Finding:**  
JWT tokens expire after 7 days, refresh tokens after 30 days. Rate limiting enforces 120 refresh attempts per 15 minutes per IP.

**Location:**

- `/Users/royadams/Sites/ckd-copilot/apps/api/app/api/users/refresh-token/route.ts` (lines 157-161)
- `/Users/royadams/Sites/ckd-copilot/apps/api/lib/auth/rateLimit.ts` (lines 33-72)

**Details:**

- ✅ HS256 HMAC algorithm used
- ✅ JWT includes `sub` (credentialId), `principalId`, `orgId`, `scopes`
- ✅ Refresh token rotation and replay detection implemented
- ✅ Rate limiting on refresh endpoint prevents brute force
- ✅ Mobile RTK Query base query handles 401 refresh correctly

---

### 1.5 Scope Enforcement Coverage

**Status:** MOSTLY COMPLIANT

**Finding:**  
Scope enforcement is applied inconsistently across endpoints. Some sensitive endpoints don't specify `neededScopes`:

**Good Example:**

```typescript
// apps/api/app/api/users/clinical/create/route.ts
const user = await requireUser(req, STEP3); // Explicit scope requirements
```

**Potential Issue:**

```typescript
// apps/api/app/api/users/get-user/route.ts (line 26)
const user: SessionUser = await requireUser(req, [], {
  allowAccountRecovery: true, // Empty scopes allowed
});
```

**Severity:** MEDIUM  
**Recommendation:**

- Document which endpoints allow empty scopes and why
- Consider if `allowAccountRecovery` should require explicit scope
- Add test coverage for scope validation

---

## 2. Data Privacy & Handling

### 2.1 PII/Clinical Data Split Implementation

**Status:** COMPLIANT

**Finding:**  
The system correctly implements the ADR-0001 PII/Clinical split design:

**Collections:**

- `users_pii` - name, email, DOB, NHS number, contact, onboarding state
- `users_clinical` - CKD stage, eGFR, medications, dietary targets

**Access Patterns:**

- PII creation: `/api/users/pii/create` - uses `user.patientId` from session ✓
- Clinical creation: `/api/users/clinical/create` - uses `user.patientId` from session ✓
- No cross-collection access without authorization ✓

**Exception - [CRITICAL]:** `/api/users/pii/[userId]` allows unauthorized modification (see 1.1)

**Severity:** LOW (except authorization bypass above)

---

### 2.2 Pseudonymization for Analytics

**Status:** COMPLIANT

**Finding:**  
Analytics pipelines use `pseudonymId` instead of `principalId`.

**Evidence:**

- `/Users/royadams/Sites/ckd-copilot/packages/core/src/isomorphic/schemas/users_pii.ts` includes `pseudonymId` field
- Ledger collections support analytics queries without PII
- No evidence of PII being sent to analytics endpoints

**Recommendation:**

- Document the pseudonymization process and UUID generation
- Verify analytics database access controls (`MONGODB_URI_ANALYTICS_RO`)
- Ensure read-only credentials are used for analytics queries

---

### 2.3 Clinical Data Mutation Audit Trails

**Status:** INCOMPLETE

**Finding:**  
While ledger collections exist for audit trails, audit logging is **not consistently implemented** across all clinical data modifications:

**Ledger Collections Found:**

- `labs_ledger`
- `measurements_ledger`
- `medications_ledger`
- `patient_goals_ledger`
- `health_profiles_ledger`
- `patient_engagement_ledger`

**Implementation Status:**

- ✅ Labs create/update: Uses `writeLabLedgerAndCurrent()` helper (line 9 of labs/create/route.ts)
- ✅ Measurements: Writes to `MeasurementsLedger` (line 207, measurements/create/route.ts)
- ⚠️ Medications: No explicit audit logging found
- ⚠️ Patient goals: Unclear if all mutations are logged
- ✅ Consent decisions: Logged with decision metadata

**NHS Compliance Gap:**  
UK GDPR requires "audit trails for all processing of personal data." The system has _ledger infrastructure_ but not **comprehensive coverage**.

**Severity:** HIGH  
**Remediation:**

1. Create a dedicated audit logging utility:

```typescript
// apps/api/lib/utils/auditLog.ts
export async function logClinicalMutation(db: Db, {
  collection: string;
  action: 'create' | 'update' | 'delete';
  patientId: ObjectId;
  principalId: string;
  changes: Record<string, any>;
  reason?: string;
}) {
  await db.collection('audit_logs').insertOne({
    collection,
    action,
    patientId,
    principalId,
    changes,
    reason,
    timestamp: new Date(),
  });
}
```

2. Audit medications endpoint update
3. Create `audit_logs` MongoDB collection with TTL index (7 years for NHS)
4. Add monthly audit report generation

---

### 2.4 Data Access Control - Clinician Permissions

**Status:** INCOMPLETE DOCUMENTATION

**Finding:**  
Clinician data access controls exist but lack explicit documentation:

**Current Implementation:**

- Clinicians have `USERS_CLINICAL_READ` and `USERS_CLINICAL_WRITE` scopes
- No code found restricting clinician to specific patients
- No care team membership checks in clinical read endpoints

**Risk:**  
Clinicians may be able to read/write clinical data for **any** patient, not just assigned care team members.

**Severity:** MEDIUM  
**Remediation:**

1. Add care team authorization checks to clinician endpoints:

```typescript
const user = await requireUser(req, [SCOPES.USERS_CLINICAL_READ]);
if (user.role === "clinician" && !user.careTeamIds?.length) {
  return bad("No care team assigned", { requestId }, 403);
}
// Verify patientId belongs to one of user's care teams
const patient = await db.collection("patients").findOne({
  _id: new ObjectId(patientId),
  careTeamId: { $in: user.careTeamIds },
});
if (!patient) return bad("Unauthorized", {}, 403);
```

2. Add integration test for clinician isolation:

```typescript
test("clinician can only access assigned care team patients", async () => {
  const clinician = await createUser("clinician");
  const patient = await createPatient({ careTeamId: "other-team" });

  const res = await fetch(`/api/users/clinical/${patient.id}`, {
    headers: { Authorization: `Bearer ${clinician.jwt}` },
  });
  expect(res.status).toBe(403);
});
```

---

## 3. NHS Compliance

### 3.1 GDPR Consent Mechanism

**Status:** PARTIALLY IMPLEMENTED

**Finding:**  
A consent system is in place for specific scenarios but lacks comprehensive coverage:

**Implementation:**

- `PatientConsents` collection tracks consent decisions
- Types: `signup_assignment`, `care_team_added`, `clinician_added`
- Statuses: `pending`, `accepted`, `declined`, `superseded`, `revoked`
- Endpoint: `/api/patient-consents/[consentId]/decide/route.ts`

**Gaps:**

1. **Research consent not explicitly handled** - PII form includes `consentResearchAt` but no workflow
2. **Implicit consent paths** - Bootstrap and account recovery allow token issuance without explicit consent
3. **Consent revocation scope unclear** - Can patients revoke consent and have data deleted?

**Severity:** MEDIUM  
**Remediation:**

1. Expand consent types to include:
   - `research_participation`
   - `data_export`
   - `third_party_sharing`

2. Document consent for account recovery:

```typescript
// apps/api/app/api/auth/exchange/route.ts
// Add explicit consent check before granting clinical write access
if (!user.consentPrivacyAt) {
  // Require consent before clinical data access
  return NextResponse.json(
    {
      consent_required: true,
      consent_type: "privacy_policy",
    },
    { status: 403 },
  );
}
```

3. Implement consent-based data purging (see 3.3)

---

### 3.2 Data Retention Policy

**Status:** NOT DOCUMENTED

**Finding:**  
No documented data retention policy found. MongoDB indexes suggest some TTL awareness:

**Evidence:**

- Rate limit records have 2x window expiry
- No evidence of data purge jobs in codebase

**NHS Requirement:**  
GDPR Article 5 requires retention policies. NHS data should be retained per Health Records Act (minimum 7-10 years) but not indefinitely.

**Severity:** HIGH  
**Remediation:**

1. Create `docs/DATA_RETENTION_POLICY.md`:

```markdown
# Data Retention Policy

## Patient Records

- Active patients: Retained indefinitely while account active
- Inactive patients: Retained for 7 years post-discharge per NHS guidelines
- Deleted patients: Permanently deleted after 30 days soft delete

## Clinical Data (Labs, Medications, Measurements)

- Retained for patient lifetime
- Can be deleted via patient request (right-to-be-forgotten)

## Audit Logs

- Retained for 7 years minimum (GDPR compliance)
- Automatic purge after 10 years

## Device/OAuth Tokens

- Refresh tokens: 30 day expiration
- Verified but unused tokens: Purged after 90 days
```

2. Implement retention monitoring:

```typescript
// schedules/purge-inactive-accounts.ts
export async function purgeInactiveAccounts(db: Db) {
  const sevenYearsAgo = new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000);

  const inactive = await db
    .collection("users_pii")
    .find({
      status: "deleted",
      deletedAt: { $lt: sevenYearsAgo },
    })
    .toArray();

  for (const user of inactive) {
    await auditLog(db, {
      action: "permanent_delete",
      reason: "retention_policy_expiry",
      principalId: user.principalId,
    });
    await deleteUserData(db, user.principalId);
  }
}
```

---

### 3.3 Right-to-Be-Forgotten (Data Deletion)

**Status:** NOT IMPLEMENTED

**Finding:**  
No evidence of GDPR Article 17 (right to erasure) implementation:

**Analysis:**

- Only 2 delete endpoints found: food deletion, nutrition favorites deletion
- No user data deletion endpoint
- No cascading deletion of clinical/PII records
- No pseudonymization of historical audit records

**Severity:** CRITICAL  
**GDPR Impact:** Non-compliance with Article 17

**Remediation:**

1. Create user deletion endpoint:

```typescript
// apps/api/app/api/users/delete/route.ts
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  const { confirmDeletion } = await req.json();

  if (!confirmDeletion) {
    return bad("Confirmation required", {}, 400);
  }

  const db = await getDb();
  const principalId = user.principalId;

  // 1. Soft delete with 30-day grace period
  await db.collection("users_pii").updateOne(
    { principalId },
    {
      $set: {
        status: "deleted",
        deletedAt: new Date(),
        email: null, // Clear PII immediately
      },
    },
  );

  // 2. Log deletion request
  await auditLog(db, {
    action: "deletion_requested",
    principalId,
    timestamp: new Date(),
  });

  // 3. Send confirmation email
  await emailService.sendDeletionConfirmation(user.email);

  return ok({ message: "Deletion scheduled", deletedAt: new Date() }, 202);
}
```

2. Add scheduled hard delete after 30 days

3. Pseudonymize audit logs before final deletion:

```typescript
// All references to deleted user → hash(principalId)
await db
  .collection("audit_logs")
  .updateMany({ principalId }, { $set: { principalId: hash(principalId) } });
```

---

### 3.4 GDPR Data Subject Access Requests (DSARs)

**Status:** NOT IMPLEMENTED

**Finding:**  
No data export/DSAR endpoint exists to allow patients to request their data in portable format.

**Severity:** HIGH  
**Remediation:**

1. Create DSAR endpoint returning JSON/CSV export:

```typescript
// apps/api/app/api/users/dsar-export/route.ts
export async function GET(req: NextRequest) {
  const user = await requireUser(req);

  const db = await getDb();
  const pii = await db.collection('users_pii')
    .findOne({ principalId: user.principalId });
  const clinical = await db.collection('users_clinical')
    .findOne({ patientId: new ObjectId(user.patientId) });
  // ... gather all data

  return NextResponse.json({
    data: {
      personal: pii,
      clinical: clinical,
      measurements: [...],
      medications: [...],
      audit_trail: [...]
    },
    exported_at: new Date(),
    format: 'application/json'
  });
}
```

2. Require authentication and send via secure link

---

## 4. Secrets Management

### 4.1 Environment Variables

**Status:** COMPLIANT

**Finding:**  
Environment variables are properly managed:

**Verification:**

- ✅ `.env*` files are in `.gitignore` (line 37, `/Users/royadams/Sites/ckd-copilot/.gitignore`)
- ✅ Secrets accessed via `process.env` in functions, not hardcoded
- ✅ JWT_SECRET loaded via `getJwtSecretValue()` wrapper (auth/jwt.ts)
- ✅ Edamam API keys are environment variables, not in code

**Configuration:**

- `JWT_SECRET` - Required, loaded in `jwt.ts`
- `MONGODB_URI_APP` - Primary database
- `MONGODB_URI_ANALYTICS_RO` - Read-only analytics
- `EXPO_PUBLIC_API_URL` - Mobile app (public, not secret)

**Recommendation:**  
Use a secrets manager (AWS Secrets Manager, HashiCorp Vault) in production instead of environment variables.

---

### 4.2 JWT Secret Strength

**Status:** COMPLIANT

**Finding:**  
JWT secret handling is secure:

```typescript
// apps/api/lib/auth/jwt.ts
export function getJwtSecretValue() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

export function getJwtSecretBytes() {
  return new TextEncoder().encode(getJwtSecretValue());
}
```

- ✅ Secret is required (throws if missing)
- ✅ Uses HS256 HMAC with TextEncoder
- ✅ 7-day token expiration is reasonable for NHS context

**Recommendation:**  
Document minimum secret entropy (recommend 32+ bytes = 256+ bits for HS256).

---

### 4.3 Mobile Token Storage

**Status:** COMPLIANT

**Finding:**  
Mobile app securely stores JWT:

```typescript
// apps/mobile/src/lib/secureStorage.ts
import * as SecureStore from "expo-secure-store";

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

export const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(sanitizeKey(key)),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(sanitizeKey(key), value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(sanitizeKey(key)),
};
```

- ✅ Uses `expo-secure-store` (Android Keystore, iOS Keychain)
- ✅ Key sanitization prevents injection
- ✅ Token stored with key `ckd_jwt`

**Implementation:** RTK Query base query retrieves token from SecureStore on each request (appApi.ts, lines 23-30).

---

## 5. Input Validation

### 5.1 Zod Schema Coverage

**Status:** MOSTLY COMPLIANT

**Finding:**  
Most API endpoints use Zod schemas for validation. Coverage:

**Good Examples:**

- ✅ PII form validation: `/packages/core/src/isomorphic/schemas/users_pii.ts` (54 lines, strict)
- ✅ Clinical form validation: `UserClinical_Create` schema with nested validation
- ✅ Labs create: Parses and validates lab codes, units, values

**Gaps:**

1. **Food search lacks schema validation:**

```typescript
// apps/api/app/api/food/search/route.ts (line 37)
const term = searchParams.get("query") ?? "";
const rawQuery = term.trim();
if (!rawQuery) {
  return bad("Query is required", { requestId }, 400);
}
// ⚠️ No length check, no injection validation
```

2. **Measurements endpoint uses inline validation:**

```typescript
// apps/api/app/api/measurements/create/route.ts (lines 350-369)
// Custom parsing instead of Zod schema
const kind = body.kind as Kind;
if (kind !== "steps" && kind !== "exercise" && ...) {
  return bad("Invalid kind", undefined, 400);
}
```

**Severity:** LOW  
**Recommendation:**

```typescript
// Create schema for measurements
const MeasurementCreateSchema = z.object({
  kind: z.enum([
    "steps",
    "exercise",
    "sleep",
    "weight",
    "blood_pressure",
    "heart_rate",
  ]),
  count: z.number().int().nonnegative().optional(),
  valueKg: z.number().positive().optional(),
  measuredAt: z.string().datetime().optional(),
  source: z.enum(["patient", "device", "api", "provider"]).default("patient"),
});

const parsed = MeasurementCreateSchema.safeParse(body);
if (!parsed.success) return bad("Validation failed", parsed.error.flatten());
```

---

### 5.2 MongoDB Injection Risk

**Status:** LOW RISK

**Finding:**  
Query construction is done safely with no dynamic `$where` operators found:

**Safe Patterns Found:**

```typescript
// Using filter objects (safe)
await collection.findOne({ principalId });
await collection.updateOne({ userId });
await collection.find({ kind: payload.kind });

// No parameterized queries needed (MongoDB doesn't support them)
// No $where, $function, or mapReduce using user input
```

**Severity:** LOW - No SQL injection equivalent in MongoDB as used here

---

### 5.3 API Response Validation Error Leakage

**Status:** HIGH RISK

**Finding:**  
MongoDB validation errors are returned to clients, potentially leaking schema information:

```typescript
// apps/api/app/api/measurements/create/route.ts (lines 299-304)
try {
  return `Document failed validation: ${JSON.stringify(details)}`;
} catch {
  return err?.message || "Document failed validation";
}

// apps/api/app/api/users/clinical/create/route.ts (line 41)
return bad("Validation failed", treeifyError(parsed.error), 400);
```

**Attack Scenario:**
Attacker sends malformed data, receives schema structure. Can then infer required fields, types, and constraints to craft attacks.

**Severity:** MEDIUM  
**Remediation:**

```typescript
// apps/api/lib/http/responses.ts
export function formatValidationError(err: any, isDev: boolean = false) {
  if (process.env.NODE_ENV !== "development" && !isDev) {
    // Production: Generic message only
    return {
      message: "Request validation failed",
      errorCount: err.issues?.length || 0,
      // Don't expose schema details
    };
  }
  // Development: Detailed errors for debugging
  return treeifyError(err);
}
```

---

## 6. Mobile Security

### 6.1 Health Connect Permissions

**Status:** COMPLIANT

**Finding:**  
Health Connect permissions are properly scoped:

```typescript
// apps/mobile/src/lib/healthConnectPermissions.ts
export const ANDROID_HEALTH_PERMISSIONS = [
  { accessType: "read", recordType: "BloodPressure" },
  { accessType: "read", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "RestingHeartRate" },
  { accessType: "read", recordType: "SleepSession" },
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "Distance" },
  { accessType: "read", recordType: "Speed" },
  { accessType: "read", recordType: "TotalCaloriesBurned" },
];
```

- ✅ Read-only access (no write permissions)
- ✅ Limited to health metrics (no SMS, calendar, location)
- ✅ Background read permission tracked separately
- ✅ Proper permission request flow implementation

---

### 6.2 Token Refresh on 401

**Status:** COMPLIANT

**Finding:**  
Token refresh is properly implemented in both contexts:

**authFetch helper:**

```typescript
// apps/mobile/src/lib/authFetch.ts (lines 27-32)
const refreshed = await refreshSessionTokenOnce();
if (!refreshed) {
  return response; // Return 401 if refresh fails
}
response = await makeRequest(); // Retry request
return response;
```

**RTK Query base query:**

```typescript
// apps/mobile/src/store/services/appApi.ts (lines 39-44)
if (result.error?.status === 401) {
  const refreshed = await refreshSessionTokenOnce();
  if (refreshed) {
    result = await rawBaseQuery(args, api, extraOptions);
  }
}
```

- ✅ Both patterns detect 401 and attempt refresh
- ✅ Refresh is rate-limited server-side
- ✅ Graceful fallback if refresh fails

---

### 6.3 HTTPS Enforcement

**Status:** NOT VERIFIED

**Finding:**  
No explicit HTTPS enforcement found in code:

**API Configuration:**

- Vercel deployment should enforce HTTPS at platform level
- Mobile app points to `EXPO_PUBLIC_API_URL` which could be HTTP in dev

**Gaps:**

1. No HTTP-to-HTTPS redirect in API
2. No HSTS header configuration
3. No certificate pinning in mobile app

**Severity:** MEDIUM  
**Remediation:**

```typescript
// apps/api/middleware.ts (add next middleware)
import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Enforce HTTPS in production
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") !== "https"
  ) {
    return NextResponse.redirect(
      `https://${request.headers.get("host")}${request.nextUrl.pathname}`,
      301,
    );
  }

  const response = NextResponse.next();

  // Add HSTS header
  response.headers.set(
    "strict-transport-security",
    "max-age=31536000; includeSubDomains; preload",
  );

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
```

---

### 6.4 Redux DevTools Exposure

**Status:** MEDIUM RISK

**Finding:**  
Redux store persists to secure storage but Redux DevTools might expose sensitive data in dev:

```typescript
// apps/mobile/src/store/index.ts
// Check if devTools are enabled in production
```

**Risk:**  
Redux DevTools browser extension can intercept state, potentially showing:

- User PII in Redux state
- JWT tokens if cached in Redux

**Severity:** MEDIUM  
**Recommendation:**

```typescript
// apps/mobile/src/store/index.ts
const store = configureStore({
  reducer: {
    /* ... */
  },
  devTools: process.env.NODE_ENV === "development",
  // Add store state serializer to redact sensitive data
  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["auth/setToken"],
        ignoredPaths: ["auth.token"],
      },
    });
  },
});
```

---

## 7. Sensitive Data Leakage

### 7.1 HIGH: Console Logging in API

**Status:** MULTIPLE VULNERABILITIES

**Finding:**  
Multiple dangerous console statements that could leak sensitive data:

**Issue 1 - Error Stack Traces** (Severity: HIGH)

```typescript
// apps/api/app/api/users/get-user/route.ts (lines 80-86)
console.error("GET /api/users/get-user failed", {
  requestId,
  error:
    error instanceof Error
      ? { message: error.message, stack: error.stack } // ⚠️ Stack leak
      : error,
});
```

**Issue 2 - Measurements Data Dump** (Severity: HIGH)

```typescript
// apps/api/app/api/measurements/create/route.ts (line 259)
console.dir(candidates, { depth: null }); // ⚠️ Dumps full payload
```

**Issue 3 - JWT Errors** (Severity: HIGH)

```typescript
// apps/api/lib/auth/auth_requireUser.ts (line 75)
console.error("jwtVerify failed", err); // ⚠️ Could leak cryptographic details
```

**Issue 4 - Multiple Refresh Token Logs** (Severity: MEDIUM)

```typescript
// apps/api/app/api/users/refresh-token/route.ts (lines 77, 96-100)
console.warn("refresh-token: validate failed", { reason: res.error });
console.warn("refresh-token: rotated token replay detected", {
  principalId: tokenDoc.principalId, // ⚠️ Leaks principal ID
  sessionId: tokenDoc.sessionId,
  tokenId: String(tokenDoc._id),
});
```

**Complete List:**

| File                              | Line               | Code                                   | Risk   |
| --------------------------------- | ------------------ | -------------------------------------- | ------ |
| auth/auth_requireUser.ts          | 75                 | console.error("jwtVerify failed", err) | HIGH   |
| auth/exchange/route.ts            | 233                | console.error(e)                       | MEDIUM |
| measurements/create/route.ts      | 259                | console.dir(candidates, {depth: null}) | HIGH   |
| users/refresh-token/route.ts      | 54,70,77,87,96     | console.warn(...)                      | MEDIUM |
| users/get-user/route.ts           | 80-86              | console.error(...error.stack)          | HIGH   |
| food/nutrients/route.ts           | 115                | console.log(error)                     | MEDIUM |
| health-connect/event-log/route.ts | 61,125,132,145,201 | console.log(...events, ...count)       | MEDIUM |

**Severity:** HIGH  
**Remediation:**

```typescript
// apps/api/lib/logging/logger.ts
const isDev = process.env.NODE_ENV === "development";

export const logger = {
  error: (context: string, error: unknown) => {
    if (isDev) {
      console.error(context, error); // Dev: Full details
    } else {
      console.error(context, {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        // NO stack traces, NO full objects
      });
    }
  },

  warn: (context: string, data?: Record<string, any>) => {
    if (isDev) {
      console.warn(context, data);
    } else {
      // Production: Only log non-sensitive fields
      const safe = { ...data };
      delete safe.token;
      delete safe.secret;
      delete safe.principalId;
      console.warn(context, safe);
    }
  },
};
```

---

### 7.2 MEDIUM: Console Logging in Mobile App

**Status:** MULTIPLE STATEMENTS

**Finding:**  
Mobile app has ~50+ console.log statements that could leak sensitive data:

```typescript
// apps/mobile/src/lib/healthConnectMeasurementSync.ts (line 618)
console.log("Health Connect sync failed", error);

// apps/mobile/src/hooks/useStepCount.ts (lines 78, 143, 173, 205)
console.log("Health Connect step load failed", { error });
console.log("iOS pedometer step load failed", { error });
console.log("Health Connect permissions requested", { permissions });
```

**Patterns:**

- ✅ Most log error messages (acceptable)
- ✅ Some log metrics/counts (acceptable)
- ⚠️ Some could log error objects with sensitive details
- ⚠️ No filtering for production builds

**Severity:** MEDIUM  
**Remediation:**

```typescript
// apps/mobile/src/lib/logger.ts
const isDev = __DEV__; // Expo DevTools detection

export const logger = {
  error: (tag: string, error: unknown) => {
    if (isDev) {
      console.log(`[${tag}]`, error);
    }
    // Production: Send to error tracking service (Sentry)
  },

  info: (tag: string, message: string) => {
    if (isDev) console.log(`[${tag}]`, message);
  },
};
```

---

### 7.3 Error Message Information Disclosure

**Status:** LOW-MEDIUM RISK

**Finding:**  
Error messages returned to clients could leak system details:

```typescript
// apps/api/app/api/measurements/create/route.ts (line 297)
"Document failed validation: measurements_ledger validator is out of date";

// apps/api/app/api/users/clinical/create/route.ts (line 41)
return bad("Validation failed", treeifyError(parsed.error), 400);
```

**Severity:** MEDIUM  
**Remediation:**
See section 5.3 for validation error handling.

---

### 7.4 Sensitive Data in API Responses

**Status:** COMPLIANT

**Finding:**  
API response envelope properly excludes sensitive fields:

```typescript
// apps/mobile/src/store/services/appApi.ts (lines 48-63)
const body = result.data as ApiEnvelope<unknown>;
if (body && typeof body === "object" && "ok" in body && "data" in body) {
  if (!body.ok) {
    return {
      error: {
        data: {
          message: formatApiError(...),
        },
        status: 200,
      },
    };
  }
  return { data: body.data };
}
```

- ✅ Only `data` field returned to client
- ✅ Error details sanitized via `formatApiError`
- ✅ Ledger queries don't expose internal IDs

---

## 8. API Response Envelope

### 8.1 Response Format

**Status:** COMPLIANT

**Finding:**  
All API responses follow consistent envelope format:

```typescript
// apps/api/lib/http/responses.ts
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function bad(message: string, errors?: unknown, status = 400) {
  return NextResponse.json({ ok: false, message, errors }, { status });
}
```

Response format:

```json
{
  "ok": true,
  "data": {
    /* payload */
  },
  "message": "optional",
  "errors": "optional"
}
```

- ✅ Consistent structure
- ✅ HTTP status codes aligned with semantic meaning
- ✅ Automatic unwrapping in mobile RTK Query base query

---

## 9. Rate Limiting

### 9.1 Implementation Status

**Status:** IMPLEMENTED FOR CRITICAL PATHS

**Finding:**  
Rate limiting is implemented for authentication endpoints:

```typescript
// apps/api/lib/auth/rateLimit.ts
- refresh_ip: 120 requests per 15 minutes
- exchange_ip: 30 requests per 15 minutes

// Enforced in:
- users/refresh-token: Line 59-66
- auth/exchange: Line 66-72
```

**Gaps:**

- No rate limiting on general API endpoints (food search, labs, measurements)
- No per-user rate limiting (only per IP)

**Recommendation:**  
Add rate limiting for high-load endpoints:

```typescript
await enforceRateLimit([
  {
    bucket: "food_search_user",
    key: user.principalId,
    limit: 100,
    windowMs: 60 * 1000, // 100 requests per minute per user
  },
]);
```

---

## 10. Database Security

### 10.1 MongoDB Connection

**Status:** NOT FULLY VERIFIED

**Finding:**  
Connection string loaded from environment:

```typescript
// apps/api/lib/db/mongodb.ts
const uri = process.env.MONGODB_URI_APP;
```

**Recommendations:**

- ✅ Connection string in environment variables (not hardcoded)
- ⚠️ No TLS/SSL verification configuration visible
- ⚠️ No IP whitelist mentioned
- ⚠️ No read-only replica for analytics mentioned

**For Vercel Deployment:**

```typescript
// Ensure connection uses TLS
const uri = process.env.MONGODB_URI_APP || "";
if (!uri.includes("tls=true")) {
  console.warn("⚠️ MongoDB connection should use TLS");
}
```

---

## Remediation Checklist

### CRITICAL PRIORITY (Do Before Production)

- [ ] **1.1** Fix authorization bypass in `/api/users/pii/[userId]` - verify `userId` matches session
- [ ] **3.3** Implement GDPR right-to-be-forgotten endpoint with cascading deletes
- [ ] **7.1** Remove all console.error/console.log statements from production API code
- [ ] **1.2** Consolidate ROLE_SCOPES definitions - remove duplicate from auth_requireUser.ts

### HIGH PRIORITY (Within 1 Sprint)

- [ ] **2.3** Implement comprehensive audit logging for all clinical data mutations
- [ ] **1.3** Sanitize JWT error logging - never log full errors
- [ ] **4.3** Add HTTPS enforcement and HSTS headers
- [ ] **3.1** Create GDPR consent workflow for research participation
- [ ] **5.3** Sanitize validation errors in API responses
- [ ] **2.4** Add care team authorization checks for clinician access

### MEDIUM PRIORITY (Within 2 Sprints)

- [ ] **3.2** Document and implement data retention policy with auto-purge
- [ ] **3.4** Implement DSAR (Data Subject Access Request) export endpoint
- [ ] **5.1** Convert custom validation to Zod schemas
- [ ] **6.2** Add rate limiting for general API endpoints
- [ ] **10.1** Verify MongoDB TLS/SSL configuration
- [ ] **7.2** Add production log filtering for mobile app
- [ ] **6.3** Consider certificate pinning for mobile app

### LOW PRIORITY (Documentation/Hardening)

- [ ] **1.4** Document token expiration strategy in SECURITY.md
- [ ] **1.5** Create scope validation test coverage
- [ ] **6.1** Document Health Connect permission scope rationale
- [ ] **4.1** Migrate to secrets manager (AWS Secrets Manager/Vault)

---

## Compliance Summary

### GDPR Compliance

| Requirement                     | Status           | Evidence                                       | Gap                                       |
| ------------------------------- | ---------------- | ---------------------------------------------- | ----------------------------------------- |
| **Lawful Basis**                | ✅ Compliant     | Consent mechanism for research/analytics       | None identified                           |
| **Purpose Limitation**          | ⚠️ Partial       | Scopes defined but not enforced everywhere     | Clinician care team validation needed     |
| **Data Minimization**           | ✅ Compliant     | PII/clinical split, health data only           | None                                      |
| **Accuracy**                    | ✅ Compliant     | User can update own PII (except bypass issue)  | Fix 1.1 authorization                     |
| **Storage Limitation**          | ❌ NOT COMPLIANT | No retention policy documented                 | Implement 3.2                             |
| **Integrity & Confidentiality** | ⚠️ Partial       | Encryption in transit (HTTPS), at rest unclear | Verify MongoDB TLS, add column encryption |
| **Accountability**              | ❌ NOT COMPLIANT | Incomplete audit trails                        | Implement 2.3                             |
| **Right to Access (DSAR)**      | ❌ NOT COMPLIANT | No data export endpoint                        | Implement 3.4                             |
| **Right to Erasure**            | ❌ NOT COMPLIANT | No deletion workflow                           | Implement 3.3                             |
| **Data Portability**            | ⚠️ Partial       | JSON format possible but no endpoint           | Implement 3.4                             |

**Overall GDPR Status:** **NON-COMPLIANT** - Must resolve critical gaps before NHS data processing

---

### NHS Data Protection Standards

| Standard              | Status           | Notes                                              |
| --------------------- | ---------------- | -------------------------------------------------- |
| **Confidentiality**   | ⚠️ Partial       | JWT encryption OK, but auth bypass risk (1.1)      |
| **Integrity**         | ⚠️ Partial       | Validation present but error leakage (5.3)         |
| **Availability**      | ✅ Compliant     | Rate limiting and refresh token rotation           |
| **Audit Trail**       | ❌ NOT COMPLIANT | Missing comprehensive clinical audit logging (2.3) |
| **Access Control**    | ⚠️ Partial       | RBAC present but inconsistent (1.2, 2.4)           |
| **Data Retention**    | ❌ NOT COMPLIANT | No retention policy (3.2)                          |
| **Incident Response** | ❓ UNKNOWN       | Error logging could hide breaches                  |

---

## Testing Recommendations

### Unit Tests to Add

```typescript
// tests/auth/authorization.test.ts
describe("Authorization", () => {
  it("user cannot modify another users PII", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const res = await fetch(`/api/users/pii/${userB.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userA.jwt}` },
      body: JSON.stringify({ email: "hacked@evil.com" }),
    });

    expect(res.status).toBe(403);
  });

  it("admin should have all scopes", async () => {
    const admin = await createTestUser("admin");
    expect(admin.scopes.length).toBeGreaterThan(20);
  });
});

// tests/privacy/audit-logging.test.ts
describe("Audit Logging", () => {
  it("clinical data mutations are logged", async () => {
    const user = await createTestUser("patient");
    await fetch(`/api/users/clinical/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.jwt}` },
      body: JSON.stringify({ ckdStage: 3 }),
    });

    const logs = await getAuditLogs(user.patientId);
    expect(logs).toContainEqual(
      expect.objectContaining({
        action: "create",
        collection: "users_clinical",
      }),
    );
  });
});

// tests/gdpr/deletion.test.ts
describe("GDPR Right to Erasure", () => {
  it("deleted patient data is purged after 30 days", async () => {
    const user = await createTestUser();
    await fetch(`/api/users/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.jwt}` },
      body: JSON.stringify({ confirmDeletion: true }),
    });

    // Fast-forward 31 days
    await advanceTime(31 * 24 * 60 * 60 * 1000);

    // Run purge job
    await runPurgeInactiveAccounts();

    // Verify data is gone
    const pii = await db
      .collection("users_pii")
      .findOne({ principalId: user.principalId });
    expect(pii).toBeNull();
  });
});
```

### Security Tests

```typescript
// tests/security/sensitive-data-leakage.test.ts
describe("Sensitive Data Leakage", () => {
  it("error responses do not expose schema structure", async () => {
    const res = await fetch(`/api/measurements/create`, {
      method: "POST",
      body: JSON.stringify({ invalid: "data" }),
    });
    const body = await res.json();

    // Should not contain schema details
    expect(body.message).not.toMatch(
      /schemaRulesNotSatisfied|additionalProperties/,
    );
  });

  it("jwt errors do not leak cryptographic details", async () => {
    // Monitor console.error calls
    const spy = jest.spyOn(console, "error");

    // Send invalid JWT
    await fetch(`/api/users/get-user`, {
      headers: { Authorization: "Bearer invalid.token.here" },
    });

    // Verify error was logged without full JWT details
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("jwtVerify failed"),
      expect.not.stringContaining(".signature"),
    );
  });
});
```

---

## References

- **GDPR:** https://gdpr-info.eu/
- **NHS Data Protection:** https://www.nhs.uk/about-us/our-policies/privacy-notice/
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **NIST Cybersecurity Framework:** https://www.nist.gov/cyberframework

---

## Audit Sign-Off

**Auditor:** NHS Cybersecurity Specialist Agent  
**Date:** June 3, 2026  
**Status:** INCOMPLETE FOR PRODUCTION

This codebase requires remediation of critical and high-severity findings before processing NHS patient data. **Do not deploy to production until items marked CRITICAL PRIORITY are resolved.**

---

**Next Steps:**

1. Assign remediation tasks to development team
2. Create pull requests with fixes for items 1.1, 1.2, 1.3, 3.3, 7.1
3. Set up automated security testing in CI/CD
4. Schedule follow-up audit after 1 sprint
5. Engage NHS Information Security team for GDPR compliance review
