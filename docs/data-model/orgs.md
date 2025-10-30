# CareTeams

**Purpose:** Tenant/org records (trusts, clinics, companies) that own facilities and patients.
**Contains PII:** No direct PII.
**Access:**

- Read: platform admins; org admins; services with orgs:read.
- Write: platform admins; services with orgs:write.
- Audit: All writes logged.

## Fields (summary)

- `slug` (string, required, unique) – URL-safe key
- `name` (string, required)
- `status` (“active” | “suspended”, required)
- `createdAt` / `updatedAt` (date, required)
- `createdBy` / `updatedBy` · string ref: `principalId` from patients or users_accounts

## Slug (what it is & how to make it)

**What is it?:**
A stable, URL-safe identifier for an org (used for tenant routing like https://<slug>.yourapp.com and as a unique key in db.orgs).

**Rules:** (DNS-safe, lowercase)

**Charset:** a–z, 0–9, - (hyphen).

**Case:** lowercase only.

**Length:** 3–63 chars (fits DNS label limits).

**Shape:** must start/end with alphanumeric; no -- doubles; no leading/trailing -.

**Uniqueness:** unique across all orgs (enforced by index).

**Immutability:** treat as immutable after creation (changes require migration + redirect plan).

## Regex (validate):

```js
^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$
```

## Generation algorithm (deterministic)

- Normalize case: lowercase.

- Transliterate accents/Unicode → ASCII: é→e, ö→o, ñ→n, etc.

- Replace separators with -: spaces, underscores, slashes, dots → -.

- Remove disallowed chars: anything not [a-z0-9-].

- Collapse repeats: convert multiple hyphens to single -.

- Trim hyphens: remove leading/trailing -.

- Enforce length: cut to 63 chars; avoid cutting mid-token if possible.

- Check reserved words: if in { "admin","www","api","app","cdn","static","files","assets" }, adjust.

- Ensure uniqueness: if taken, append a short suffix (e.g., -rf1, -london2, or -x7f3).

**Collision strategy**

- Prefer semantic suffixes first (city/region): royal-free → royal-free-london.

- Fall back to short random/hashed suffix (3–4 base36 chars): royal-free-x7f.

## Examples

| Name                                     | Slug                        |
| ---------------------------------------- | --------------------------- |
| “Royal Free London NHS Foundation Trust” | `royal-free-london`         |
| “St. Mary’s & John – Clinic (East)”      | `st-marys-john-clinic-east` |
| “Çeşme Sağlık Merkezi”                   | `cesme-saglik-merkezi`      |
| “ACME Health_Inc”                        | `acme-health-inc`           |
| “API” (reserved)                         | `api-org` (or `api-1`)      |

## Aliases & Rename / Redirect Policy

- Why aliases? Preserve old subdomains after a rename (SEO, bookmarks, QR codes, integrations).

## Contract

- aliases is an array of valid slugs that must not include the current slug.

- Each alias value is globally unique across all orgs (enforced by a unique index on aliases).

- Routing: Requests to https://<alias>.yourapp.com resolve to the canonical org and return HTTP 301 to https://<slug>.yourapp.com (or internally rewrite).

- Lifecycle: Keep aliases for at least N days (e.g., 180). You may retire old aliases after monitoring 0 traffic + comms.

## Rename flow

- Preflight: ensure new nextSlug is valid & not in use.

- Update org: set aliases = (aliases ∪ {oldSlug}), set slug = nextSlug, bump updatedAt/updatedBy, audit.

- Routing: middleware maps Host subdomain → if in org.slug → serve; if in org.aliases → 301 redirect to canonical.

- Comms: notify users/integrations; update DNS/branding if needed.

- Monitor: log alias hits; retire if no usage.

## Indexes

```js
[
  { key: { slug: 1 }, options: { unique: true } },
  { key: { name: 1 } },
  { key: { status: 1, updatedAt: -1 } },
];
```

## Common queries

```js
// Lookup by slug (login/tenant routing)
db.orgs.findOne({ slug });

// Resolve from host subdomain (either slug or alias)
db.orgs.findOne({ $or: [{ slug: sub }, { aliases: sub }] });

// Show suspended orgs by most recent change
db.orgs.find({ status: "suspended" }).sort({ updatedAt: -1 });
```
