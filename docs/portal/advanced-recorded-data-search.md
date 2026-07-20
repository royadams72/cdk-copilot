# Advanced recorded-data search

The portal dashboard contains a clinician-initiated search for factual changes in recorded data. It replaces the former worsening-trend alert and follow-up workflow.

## Behaviour

- Nothing is evaluated until a staff user submits the search.
- Staff can select one or more of weight, blood pressure, symptoms, steps and nutrition.
- Increasing and decreasing are factual comparison directions, not clinical classifications.
- The selected period is compared with the immediately preceding equal period.
- “Any” returns a patient when any selected item matches; “all” requires every selected item to match.
- Results do not create alerts, urgency, escalation, review status, tasks or patient notifications.
- Opening a result takes the clinician to the patient record for interpretation.

The initial nutrition comparison uses average calories per recorded entry. Symptom comparison uses average recorded severity; blood pressure uses average systolic pressure. These labels must remain visible so users understand what was compared.

## Removal boundary

The patient worsening check-in screen, active/viewed/check-in endpoints, portal review endpoints, reviewed-trend pages and measurement-triggered notification sync have been removed. On authenticated app startup, legacy scheduled worsening notifications are cancelled and their local state is cleared. Historical database collections are not deleted.
