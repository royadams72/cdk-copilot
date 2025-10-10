# app_error_logs

**Purpose:** Capture API/job exceptions and warnings for ops triage. Not an audit log.
**Contains PII:** Avoid; store IDs/refs only.
**Access:** Engineering/ops only.

## Fields (summary)

- `_id` · ObjectId · **PK**
- `at` · Date (error time)
- `level` · enum (`error|warn|info`)
- `service` · string (e.g., `api`, `worker`, `cron:dm+d-import`)
- `env` · string (`local|dev|staging|prod`)
- `orgId?` · string
- `actorAuthId?` · string
- `route?` · string
- `code?` · string (app error code)
- `message` · string
- `stack?` · string (redact secrets/PII)
- `context` · object (IDs/flags only; **no PII**)
- `requestId?` · string (trace id)
- `resolvedAt?` · Date
- `tags?` · string[]

## Indexes / TTL

```js
db.app_error_logs.createIndex({ at: -1 });
db.app_error_logs.createIndex({ service: 1, level: 1, at: -1 });
db.app_error_logs.createIndex({ "context.patientId": 1, at: -1 });
db.app_error_logs.createIndex({ "context.route": 1, at: -1 });
// Auto-expire after 30 days:
db.app_error_logs.createIndex(
  { at: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 }
);
```

## Notes

- Use Sentry/Datadog as primary; mirror key fields here for quick, in-DB triage and joins.
