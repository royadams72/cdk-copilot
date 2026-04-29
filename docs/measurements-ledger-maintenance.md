# Measurements Ledger Maintenance

This document covers the one-off audit and cleanup scripts for provider-synced measurement rows in `measurements_ledger`.

These scripts are intended for maintenance and repair of historical data, especially when older rows predate the current upsert/deduping logic.

## Health Connect runtime telemetry

Background-task visibility is stored in `health_connect_event_logs`.

Purpose:
- confirm whether Android background tasks actually ran while the app was closed
- preserve sync telemetry longer than rolling Vercel runtime logs
- track `steps` sync starts, skips, successes, and failures
- track Health Connect incremental sync starts, skips, finishes, and failures

Relevant API route:

- `POST /api/users/health-connect/event-log`
- `GET /api/users/health-connect/event-log?limit=100`

Retention:
- documents auto-expire after 60 days

Important:
- mobile may queue events locally and flush them later
- if the device was offline during a background run, the event can still appear later once the app opens and flushes its queue

## Scripts

### Step audits and cleanup

- `pnpm db:audit:measurements`
- `pnpm db:cleanup:steps`

Purpose:
- audit provider `steps` rows for duplicate daily summaries
- remove duplicate provider `steps` rows
- preserve one canonical row per duplicate day bucket
- stamp `sync` metadata on the kept canonical row when validation allows it

### Heart-rate audits and cleanup

- `pnpm db:audit:heart-rate`
- `pnpm db:cleanup:heart-rate`

Purpose:
- audit provider `heart_rate` rows for duplicate imported samples
- remove exact duplicate provider `heart_rate` rows
- preserve one canonical row per duplicate signature

## Safety model

All cleanup scripts are dry-run by default.

That means:
- they print the duplicate buckets they would change
- they do not write or delete anything until `--apply` is passed

Always run the audit and dry-run first before using `--apply`.

## Environment

These scripts read Mongo connection settings from:

- `MONGODB_URI_MIGRATIONS`, or fallback
- `MONGODB_URI_APP`
- `MONGODB_DB` or `DB_NAME`

They load both:

- `.env.local`
- `.env`

## Step maintenance

### Audit all patients

```sh
pnpm db:audit:measurements
```

### Audit a single patient

```sh
pnpm db:audit:measurements -- --patientId <patientId>
```

What the audit reports:

- total document counts
- total `steps` document counts
- provider `steps` document counts
- provider `steps` rows that already have `sync` metadata
- duplicate provider `steps` rows by `externalRecordId`
- duplicate provider `steps` rows by calendar day

### Dry-run cleanup

```sh
pnpm db:cleanup:steps -- --patientId <patientId>
```

### Apply cleanup

```sh
pnpm db:cleanup:steps -- --patientId <patientId> --apply
```

Current cleanup behavior:

- only touches `kind="steps"` rows with `source="provider"`
- groups duplicates by provider step day
- keeps one canonical row
- deletes the rest
- tries to stamp `sync` metadata on the canonical row
- if `sync` stamping fails validation, logs a warning and still removes the duplicate rows

Important:
- this is intentionally conservative
- it does not touch manual step rows
- it does not merge unrelated providers

## Heart-rate maintenance

### Audit all patients

```sh
pnpm db:audit:heart-rate
```

### Audit a single patient

```sh
pnpm db:audit:heart-rate -- --patientId <patientId>
```

What the audit reports:

- total `heart_rate` document counts
- provider `heart_rate` document counts
- duplicate provider `heart_rate` rows by `externalRecordId`
- duplicate provider `heart_rate` rows by exact `measuredAt + bpm`

### Dry-run cleanup

```sh
pnpm db:cleanup:heart-rate -- --patientId <patientId>
```

### Apply cleanup

```sh
pnpm db:cleanup:heart-rate -- --patientId <patientId> --apply
```

Current cleanup behavior:

- only touches `kind="heart_rate"` rows with `source="provider"`
- dedupes by canonical signature:
  - `externalRecordId` when present
  - otherwise exact `provider + measuredAt + bpm`
- keeps one canonical row
- deletes the rest

Important:
- this does not collapse legitimate multiple heart-rate readings from the same day
- it only removes exact duplicate imported samples

## Validator dependency

If maintenance needs to write new fields such as `sync`, make sure Mongo validators are up to date:

```sh
pnpm db:apply-validators
```

This is especially important for provider `steps` rows, because the canonical row may need `sync.status`, `sync.dayKey`, `sync.lastReconciledAt`, and `sync.finalizedAt`.

## Recommended workflow

1. Run the audit.
2. Review duplicate buckets.
3. Run the cleanup script without `--apply`.
4. Apply Mongo validators if needed.
5. Re-run cleanup with `--apply`.
6. Re-run the audit to confirm the duplicate buckets are gone.
