**Purpose:** Holds password hashes and related security state. No PII, no plaintext passwords.

## Fields (summary)

- `_id` · ObjectId — used as credentialId in auth_links for provider=password
- `provider` · literal "password" (collection is for secrets; keep non-password secrets here too if needed)
- `hash` · string — e.g., $argon2id$v=19$m=65536,t=3,p=1$…
- `algo` · enum (argon2id|scrypt) — default argon2idß
- `params` · object — effective KDF settings used to derive hash
  m · int (memory), t · int (iterations), p · int (parallelism)
- `passwordStatus` · enum (set|needs_reset|disabled|compromised) — default set
- `passwordUpdatedAt` · Date
- `passwordHistory`[] · array of { hash, changedAt } — optional, for reuse checks
- `failedLoginCount` · int — lockout counter
- `lockoutUntil`? · Date — optional lockout expiry
- `mfa` · object
- `totpEnabled` · bool
- `totpSecretEnc`? · string (encrypted, never plaintext)
- `recoveryCodes`[] · string[] (each hashed, not plaintext)
- `createdAt` / `updatedAt` · Date
- `createdBy` / `updatedBy` · string (ref: principalId)

## Indexes

```js
[
  {
    key: { accountId: 1, provider: 1 },
    options: { unique: true, name: "uniq_account_provider" },
  },
  {
    key: { provider: 1, credentialId: 1 },
    options: { unique: true, name: "uniq_provider_credential" },
  },
  { key: { accountId: 1 }, options: { name: "byAccount" } },
];
```

```json
{
  "_id": { "$oid": "67177f9d2f3e1c5a9a0f9b33" },
  "provider": "password",
  "hash": "$argon2id$v=19$m=131072,t=3,p=1$RkZGN0...$irv1...",
  "algo": "argon2id",
  "params": { "m": 131072, "t": 3, "p": 1 },
  "passwordStatus": "set",
  "passwordUpdatedAt": "2025-10-22T09:15:00.000Z",
  "passwordHistory": [],
  "failedLoginCount": 0,
  "mfa": { "totpEnabled": false, "recoveryCodes": [] },
  "createdAt": "2025-10-22T09:15:00.000Z",
  "updatedAt": "2025-10-22T09:15:00.000Z",
  "createdBy": "system:auth",
  "updatedBy": "system:auth"
}
```
