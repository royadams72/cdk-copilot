# Dashboard sample data

Use these JSON snippets to seed MongoDB with realistic dashboard data for a demo patient. The values line up with the new `/api/dashboard` route so you can immediately see the radial nutrient charts, lab tiles, and the phosphorus-to-protein ratio in the mobile app.

## Files

| File | Target collection | Purpose |
| --- | --- | --- |
| `patients.dashboard-sample.json` | `patients` | Minimal operational record that links the sample principal and patient IDs. |
| `users_clinical.dashboard-sample.json` | `users_clinical` | Supplies stage, eGFR, and nutrient targets used by the dashboard. |
| `labs_ledger.dashboard-sample.json` | `labs_ledger` | Latest eGFR, serum phosphorus, and potassium lab values for the tiles. |
| `nutrition_ledger.dashboard-sample.json` | `nutrition_ledger` | Three recent meals with enough protein/phosphorus data to fill the radials and ratio. |

All documents reference the same `patientId`: `66f1b7e9c2ab4a0c9f3a1e21`. If you onboard a user in the app, make sure that account ultimately points to this patient (or update the ObjectId in these files before importing).

## Import via MongoDB Atlas UI

1. Download the four JSON files from `docs/data-model/`.
2. In Atlas, open **Database** > **Collections** and choose your application database (default: `ckd-copilot`).
3. For each target collection:
   1. Select the collection (create it first if it doesn't exist).
   2. Click **Import Data** > **JSON**.
   3. Pick the matching `*.dashboard-sample.json` file.
   4. Enable **Array of documents** so Atlas treats the file as a JSON array.
   5. Import. Repeat for all four collections in the order shown above so the patient document exists before the dependent records.

Atlas will coerce the Extended JSON (`$oid`/`$date`) into real `ObjectId` and `Date` values automatically.

## Import via `mongoimport`

If you have the MongoDB Database Tools installed you can load the same data from the command line (run these from the repo root, swapping in your Atlas connection string):

```bash
export MONGO_URI='mongodb+srv://<user>:<password>@<cluster>/ckd-copilot'

mongoimport --uri "$MONGO_URI" --jsonArray \
  --collection patients \
  --file docs/data-model/patients.dashboard-sample.json

mongoimport --uri "$MONGO_URI" --jsonArray \
  --collection users_clinical \
  --file docs/data-model/users_clinical.dashboard-sample.json

mongoimport --uri "$MONGO_URI" --jsonArray \
  --collection labs_ledger \
  --file docs/data-model/labs_ledger.dashboard-sample.json

mongoimport --uri "$MONGO_URI" --jsonArray \
  --collection nutrition_ledger \
  --file docs/data-model/nutrition_ledger.dashboard-sample.json
```

## After importing

- Run the API (`pnpm api:dev`) so the `/api/dashboard` route can aggregate the new data.
- Complete onboarding in the mobile app (or manually set the JWT) so the logged-in user resolves to `patientId` `66f1b7e9c2ab4a0c9f3a1e21`.
- Open the dashboard screen; you should see:
  - Protein/phosphorus/potassium radials populated from the nutrition ledger entries.
  - A computed phosphorus : protein ratio of roughly 9.6 mg/g (within the default threshold).
  - eGFR, phosphorus, and potassium tiles sourced from the `labs_ledger` documents.

Replace the nutrient or lab values in the JSON and re-import if you want to simulate different scenarios (for example, higher phosphorus intake to trigger the "Above target" badge).
