# facilities (collection)

**Purpose:** Master list of an organisation’s sites/clinics/wards used for scoping patients, staff and reporting.

## Schema (summary)

- `orgId` _(string, required)_ – owning organisation ID
- `code` _(string, required)_ – short stable code (e.g. “RFH-NEPH-OPD”)
- `name` _(string, required)_ – human-readable name
- `createdAt` _(date, required)_ – creation timestamp
- `updatedAt` _(date, required)_ – last update timestamp
- Other fields allowed via `additionalProperties: true`

## Validators

Applied in Mongo via JSON Schema (validationLevel: **moderate**, action: **error**).

## Indexes

```json
[
  { "key": { "orgId": 1, "code": 1 }, "options": { "unique": true } },
  { "key": { "orgId": 1, "name": 1 }, "options": { "unique": true } },
  { "key": { "orgId": 1, "updatedAt": -1 } }
]
```

## Why

- { orgId, code } unique → no duplicate codes within an org.
- { orgId, name } unique → avoid name collisions per org.
- { orgId, updatedAt } → fast “recently changed facilities” per org.

## Common queries

# Lookup by code within an org

```js
db.facilities.findOne({ orgId, code });
```

# List facilities for an org, newest first

```js
db.facilities.find({ orgId }).sort({ updatedAt: -1 }).limit(50);
```

# Ensure existence before assigning a patient

```js
const f = await db.facilities.findOne({ orgId, code });
if (!f) throw new Error("Unknown facility code");
```
