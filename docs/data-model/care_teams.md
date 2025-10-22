# CareTeams

**Purpose:** Teams of clinicians/staff within an organisation used to group responsibility for patients, tasks, and care plans.
**Contains PII:** No direct PII. References users by their `userId` (`application auth id`) rather than names/emails.
**Access:** Read: org admins; members of the team; services with careteams:read. Write: org admins; services with careteams:write. Audit: All writes logged with actorAuthId, requestId, timestamps.

## Fields (summary)

- `orgId` (string, required) – owning organisation
- `name` (string, required)
- `memberUserIds` (string[], optional) – list of user ids in the team
- `createdAt` / `updatedAt`
- `createdBy` / `updatedBy` · string ref: `principalId` from patients or users_accounts
- Additional properties allowed

## Indexes

```js
[
  { key: { orgId: 1, name: 1 }, options: { unique: true } },
  { key: { orgId: 1, updatedAt: -1 } },
  { key: { orgId: 1, memberUserIds: 1 } },
];
```

## Why

- Unique { orgId, name } prevents duplicate team names within an org.
- { orgId, updatedAt } powers “recently changed teams” views.
- { orgId, memberUserIds } lets you quickly find teams a user belongs to.

## Common queries

```js
db.care_teams.find({ orgId }).sort({ updatedAt: -1 }).limit(50);
db.care_teams.find({ orgId, memberUserIds: userId });
db.care_teams.findOne({ orgId, name });
```
