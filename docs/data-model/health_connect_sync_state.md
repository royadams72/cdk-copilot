# health_connect_sync_state

**Purpose:** Stores the server-side Health Connect sync cursor for each patient so mobile sync can resume after reinstall, cache clear, or phone change.
**Contains PII:** No direct PII beyond patient linkage.
**Access:** App server only.

## Fields

- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `provider` · enum (`health_connect`)
- `recordTypes.steps.lastSyncedAt` · Date
- `recordTypes.heart_rate.lastSyncedAt` · Date
- `recordTypes.sleep.lastSyncedAt` · Date
- `recordTypes.exercise.lastSyncedAt` · Date
- `recordTypes.blood_pressure.lastSyncedAt` · Date
- `createdAt` / `updatedAt`

## Notes

- Cursors are stored per record type so high-frequency metrics like steps do not force the same sync position on lower-frequency metrics like sleep.
- The backend is the durable source of truth for sync progress.
- Mobile clients may keep a local optimization cursor, but they should always tolerate the server cursor being newer or older.

## Indexes

- unique on `(patientId, provider)`
- secondary index on `(orgId, updatedAt desc)`
