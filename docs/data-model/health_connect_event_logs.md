# health_connect_event_logs

**Purpose:** Durable telemetry for Health Connect sync execution on mobile, including background-task visibility after Vercel runtime logs have rolled away.
**Contains PII:** Avoid free-text PII. Store patient linkage and operational metadata only.
**Access:** Engineering/ops only.

## Fields

- `_id` · ObjectId · **PK**
- `at` · Date · server receive time
- `clientAt?` · Date · event time on device when available
- `patientId` · ObjectId
- `orgId?` · string
- `platform` · enum (`android|ios`)
- `env` · string
- `source` · string
  Examples: `background-task`, `foreground-sync`, `sync-hook`
- `trigger?` · string
  Examples: `mount`, `active`, `interval`, `background-task`
- `event` · string
  Examples: `background-task-start`, `background-task-success`, `steps-sync-start`, `steps-sync-success`, `health-connect-sync-fail`
- `status?` · enum (`info|warn|error`)
- `deviceId?` · string
- `payload?` · object
  IDs, counters, booleans, date keys, and error summaries only

## Indexes / TTL

```js
db.health_connect_event_logs.createIndex({ at: -1 });
db.health_connect_event_logs.createIndex({ patientId: 1, at: -1 });
db.health_connect_event_logs.createIndex({ event: 1, at: -1 });
db.health_connect_event_logs.createIndex({ source: 1, at: -1 });
db.health_connect_event_logs.createIndex(
  { at: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 60 }
);
```

## Notes

- This collection is for operational tracing, not product analytics.
- It is especially useful for confirming whether Android background tasks fired while the app was closed.
- Mobile may queue events locally and flush them later if the device was offline when the event happened.
