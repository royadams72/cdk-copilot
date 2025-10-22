# auth_links

**Purpose:** Map a **credential** (login method) to a **principal** (the person).
A person can have multiple credentials (e.g., password, Apple, Google); a credential belongs to exactly one principal.

- **Principal:** your stable, immutable app identity (e.g., `acc_…` for staff, `pat_…` for patients).
- **Credential:** the thing that authenticates right now (what you put in JWT `sub`).

## Document shape

```json
{
  "_id":  { "$oid": "66fa10a2e1b3d0c5a4f1c001" },
  "provider": "password" | "apple" | "google" | "nhs" | "azuread" | "magic",
  "credentialId": "cred_01J…",            //Unique each auth type/provder has one, put this into JWT `sub`
  "principalId": "acc_01J…" | "pat_01J…", // stable person id
  "email": "sam@clinic.org",              // OPTIONAL (normalize to lowercase)
  "providerSubject": "apple|A1B2C3",      // OPTIONAL: external IdP subject
  "active": true,
  "createdAt": "2025-10-21T12:00:00.000Z",
  "deactivatedAt": "2025-11-01T09:30:00.000Z" // OPTIONAL when active=false
}
```

## Notes

- credentialId is unique per provider when active. We enforce this with a partial unique index.
- Keep principalId stable (UUIDv7/ULID string you control).
- Use active=false + deactivatedAt for rotation/revocation; do not hard-delete.
- Always look up with active:true and then load the principal.

## Required indexes

```js
// 1) Unique active credential per provider
db.auth_links.createIndex(
  { provider: 1, credentialId: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

// 2) Helpful lookups by email within provider (active only)
db.auth_links.createIndex(
  { provider: 1, email: 1 },
  { partialFilterExpression: { active: true } }
);

// 3) All links for a person
db.auth_links.createIndex({ principalId: 1, active: 1 });
```

## Common queries

```js
// Resolve JWT → principal

const link = await db
  .collection("auth_links")
  .findOne({ provider, credentialId, active: true });
if (!link) throw new Error("Forbidden");
const principalId = link.principalId;

// Rotate password credential

await db
  .collection("auth_links")
  .updateOne(
    { provider: "password", credentialId: oldCred, active: true },
    { $set: { active: false, deactivatedAt: new Date() } }
  );
await db.collection("auth_links").insertOne({
  provider: "password",
  credentialId: newCred,
  principalId,
  email,
  active: true,
  createdAt: new Date(),
});

// Link Apple to the same person

await db.collection("auth_links").insertOne({
  provider: "apple",
  credentialId: appleCredId,
  providerSubject: appleSub,
  principalId,
  active: true,
  createdAt: new Date(),
});
```
