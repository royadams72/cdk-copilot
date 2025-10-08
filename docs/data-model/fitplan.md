# UserClinical (Sensitive Clinical Data)

**Purpose:** Storing the fitness plan with exercises.
**Contains PII:** No direct PII; linked to `UserPII` by `userId`.
**Access:** Strict. Only the user (self), app server, and assigned clinicians (if applicable).
**Logging:** All reads/writes are audited (who/when/which user). Payloads are **not** logged.

## Fields (summary)

- `userId` · string · **FK → UserPII.id**
- `pseudonymId` · string (for analytics/research only)
- `fitnessPlans` array of objects with current/past fitplans[{`overview`: {title, copy}, `weeklySchedule`: {title, days: [{day: string, title, exercises: [exercise, action, video?]}]},`nutritionLifestyleTips` · object of {title, tips: [{tips: string, action: string}]}, conclusion: {title, copy} }]
- `form` · a dump of the redux store { aboutYou, injuries, yourGoals, preferences}
- `createdAt` / `updatedAt`
