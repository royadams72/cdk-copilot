# CKD Copilot: initial intended-purpose and MHRA software assessment

**Status:** Draft for product, renal-clinical and UK medical-device regulatory review. This is not an MHRA determination or release approval.
**Assessment date:** 15 September 2026
**Assessed market:** Great Britain (England, Scotland and Wales). Northern Ireland requires a separate regulatory-route review.
**Assessed product:** Patient mobile app and clinician portal in this repository, after removal of the saved weekly nutrition report and implementation of required target review. A release-specific version, enabled-feature list and external marketing claims must be added before sign-off.

## 1. Decision this assessment must support

Determine whether CKD Copilot, or a separable feature of it, is intended for a medical purpose under the applicable UK medical-device rules. Assess **functionality and all claims together**: in-app text, outputs, instructions, website, invitation email and app-store descriptions. “Review surrounding claims” means checking whether those words promise CKD monitoring, advice or clinical action beyond the screen's actual record/display function. A disclaimer is a safety communication, not evidence that software lacks a medical purpose.

**No product-level qualification conclusion is assigned yet.** General-reference targets, range labels, engagement notifications and clinician trend summaries must be assessed as they actually operate. Required target review and patient edits do not by themselves decide medical-device status. No risk class or conformity route is assigned here.

## 2. Proposed factual intended-purpose statement for review

> CKD Copilot is a mobile and web-based service intended for people with CKD and their authorised care-team members. It helps patients record and review meals, symptoms, measurements, laboratory results, medication information and activity; view recorded trends and nutrient contributions; compare recorded values with clearly identified personal, general-reference or care-team targets; and share selected information with authorised clinicians. Clinicians may review the underlying information and make their own decisions. The app does not diagnose CKD or other conditions or instruct patients to change medication or treatment. Patient engagement notifications describe logging and target streaks rather than clinical urgency.

**Draft for review, not release copy.** The target-onboarding code described below requires release testing. The final statement must also specify the intended population (including any exclusions), clinician workflow, and whether access means passive review or active monitoring. Do not promise that clinicians continuously monitor the app unless the service actually provides that response pathway.

## 3. Feature-level screening

### Patient record entry and display

Patient-entered meals, symptoms, readings and medications become stored entries and history. The proposed role is patient recordkeeping and clinician review, not app-generated clinical conclusions. **Initial screening:** Record/display function; verify that onboarding, invitations, website and app-store wording make no stronger claims.

### Connected-health and activity trends

Health-device readings become charts and progress against targets. The app does not instruct patients or clinicians how to act on these trends; clinicians can inspect the underlying readings and use their own judgement. **Initial screening:** Recorded-data presentation, subject to confirmation that labels and claims do not promise automated CKD guidance.

### General renal and lifestyle reference targets

**Implemented behavior for newly seeded targets:** stored general references start inactive; each metric is unset unless the patient explicitly selects the reference, saves a separate personal goal, or has a care-team target. Patients must review the target page and confirm before onboarding is completed, but are not required to invent a number for each metric. Recorded data can still be graphed without target lines or target-based engagement notifications. A care-team target takes precedence over a personal goal and cannot be changed by the patient. Older completed target records without the new selection flag retain legacy behavior pending separate review or migration; incomplete accounts are normalised at required onboarding confirmation. Do not store zero as an active target. A general reference must not be described as an individual prescription or silently adopted as a care-team target. **Initial screening:** Verify the release build, legacy-record behavior and downstream comparisons. Selection and editability improve clarity and user control but do not alone establish non-device status.

### Patient personal goals and clinician-set targets

The patient can set a personal goal without overwriting a separate target entered by the care team. The app displays which source applies to a comparison; a clinician-set value remains attributable to that clinician. **Initial screening:** Check that comparisons remain factual and do not become app-generated instructions. Assess any clinical use of the displayed comparison, not merely who entered the number.

### Daily and monthly food contributions; patient engagement streaks

The selected day's “foods with highest…” list is calculated directly from meal items through the nutrition-trend route. The monthly list reads a separate monthly summary built from that month's meal items. Patient engagement notifications report recorded streaks such as days logging meals or days below a stated nutrient target. **Initial screening:** Describe these as factual summaries of recorded data and stated targets. Verify logging completeness, target provenance, labels and notification wording; do not imply that a streak proves clinical safety or that a nutrient limit is appropriate for everyone.

### Laboratory flags and trends

Lab results and a specified reference range or supplied flag produce high/low/normal labels and trends. Is the app only showing position relative to the range, or also suggesting a clinical conclusion or follow-up action? **Initial screening:** Review range and flag provenance, intended use and claims; a straightforward range comparison alone does not establish medical-device status.

### Symptom logging

A patient report, including the patient's own 1–5 severity rating, becomes structured history for care-team review. The clinician portal can filter for increases or decreases by comparing recorded values across time windows; it does not triage, assign urgency or recommend treatment. **Initial screening:** Record/display and factual trend search, subject to verifying labels, claims and clinician workflow.

### Clinician reports and care plans

Patient records and staff-authored plans become clinician views and patient tasks. The portal does perform arithmetic summaries, such as averages and increase/decrease trend searches, so “no calculations” would be inaccurate. The inspected search path makes no diagnosis or treatment recommendation; clinicians can inspect source data and make their own decisions. **Initial screening:** Distinguish factual aggregation from clinical interpretation, and verify whether any other report makes a stronger claim.

Evidence observed: [target state](../../docs/data-model/targets_current.md), [target UI](../../apps/mobile/src/screens/targets/TargetsScreen.tsx), [daily highlights](../../apps/api/lib/utils/dashboard.ts), [monthly summary](../../apps/api/lib/utils/nutritionMonthlySummary.ts), [patient streaks](../../apps/api/lib/utils/patientEngagement.ts), [labs flag display](../../apps/mobile/src/screens/labs/components/LabsCard.tsx), [symptom UI](../../apps/mobile/src/screens/symptoms/SymptomsScreen.tsx), [clinician trend search](../../apps/api/app/api/portal/patients/trend-search/route.ts). These are implementation observations, not a verified release inventory.

## 4. Qualification questions to resolve

For each feature above, document answers and attach representative screenshots:

1. What exactly is the input, calculation/logic and output? Is the output a factual record, range comparison or arithmetic summary, or does it add a clinical conclusion or instruction?
2. What clinical condition, if any, is the feature intended to diagnose, prevent, monitor, predict, treat or alleviate?
3. Who uses the output: patient, renal clinician, dietitian or administrator? What action is each expected to take, and is a clinician required to review the source data?
4. What populations are in scope or excluded: CKD stage, dialysis, transplant, pregnancy, paediatric patients, acute illness and clinician-prescribed restrictions?
5. What foreseeable wrong output or misuse could cause harm? Include an inappropriate generic target, a falsely reassuring range label, incomplete meal logging and a clinician mistaking a trend filter for a clinical assessment.
6. Do app-store, website, invitation and portal claims describe a stronger medical function than the interface or this statement?
7. After target-onboarding release testing, do remaining claims and features accurately match the revised intended-purpose statement? Can any further feature be scoped separately without leaving its downstream effects in the product?

## 5. Review and release gates

- **Product owner:** confirm release features, intended users, populations, claims and intended actions.
- **Renal clinical reviewer:** review unsafe-use scenarios, contraindications, source-data limitations and whether outputs could change care.
- **UK medical-device regulatory reviewer:** apply the MHRA software guidance and flowcharts feature by feature; document the qualification conclusion and, if applicable, risk classification and conformity route.
- **If still borderline:** send a complete intended-purpose and functionality dossier to the MHRA borderline team for advice. Do not infer approval from silence.
- **Before UK release of a medical-device feature:** complete the applicable regulatory and clinical-safety work. A disclaimer does not substitute for it.
- **On every material change:** recheck qualification when target rules, range labels, notifications, intended users, populations or marketing claims change. Reassess after target-onboarding implementation.

## 6. Materials to collect next

- Exact mobile and portal release version and feature flags.
- Current and proposed website, app-store, invitation-email and onboarding wording.
- Screenshots and sample outputs for required target onboarding (all/some/no metrics set, clinician priority, and legacy records), daily/monthly food highlights, engagement notifications, lab labels, symptoms and clinician trend searches.
- Target-rule sources and thresholds; lab range and flag provenance; how comparison screens convey incomplete logging and target source.
- Confirm the release inventory and decide how historical reports created before this feature was removed will be retained or deleted; feature removal does not erase stored patient data.
- Written decision on whether patients are expected to act on any remaining target comparisons or only discuss them with a care team.

## 7. Primary guidance

- [MHRA: Medical devices—software applications, including the standalone-software flowcharts](https://www.gov.uk/government/publications/medical-devices-software-applications-apps)
- [MHRA: Crafting an intended purpose for software as a medical device](https://www.gov.uk/government/publications/crafting-an-intended-purpose-in-the-context-of-software-as-a-medical-device-samd/crafting-an-intended-purpose-in-the-context-of-software-as-a-medical-device-samd)
- [MHRA: Borderline products and how to seek advice](https://www.gov.uk/guidance/borderline-products-how-to-tell-if-your-product-is-a-medical-device)
- [MHRA: Regulation of medical devices in the UK](https://www.gov.uk/guidance/regulating-medical-devices-in-the-uk)
