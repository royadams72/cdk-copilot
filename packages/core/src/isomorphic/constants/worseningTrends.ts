import { z } from "zod";

export const WorseningTrendKey = z.enum([
  "blood_pressure_up",
  "nutrition_worsening",
  "steps_decline",
  "symptoms_worsening",
  "weight_decrease",
  "weight_increase",
]);

export type WorseningTrendKey = z.infer<typeof WorseningTrendKey>;

export const WorseningEscalationLevel = z.enum([
  "level_1_nudge",
  "level_2_check_in",
  "level_3_escalate",
  "level_3_high_priority",
]);

export type WorseningEscalationLevel = z.infer<typeof WorseningEscalationLevel>;

export const WeightGainCheckInReason = z.enum([
  "holiday",
  "ate_more",
  "more_salty_food",
  "more_fluid",
  "missed_tasks",
  "trying_to_gain_weight",
  "swelling",
  "breathless",
  "less_urine",
  "other_worsening_symptoms",
  "unknown",
]);

export type WeightGainCheckInReason = z.infer<typeof WeightGainCheckInReason>;

export const WeightLossCheckInReason = z.enum([
  "intentional_weight_loss",
  "poor_appetite",
  "nausea",
  "vomiting",
  "diarrhoea",
  "unwell",
  "other_symptoms",
  "unknown",
]);

export type WeightLossCheckInReason = z.infer<typeof WeightLossCheckInReason>;

export const BloodPressureCheckInReason = z.enum([
  "more_salty_food",
  "missed_medication",
  "stress",
  "poor_sleep",
  "illness",
  "headache",
  "swelling",
  "breathless",
  "unknown",
]);

export type BloodPressureCheckInReason = z.infer<typeof BloodPressureCheckInReason>;

export const SymptomCheckInStatus = z.enum([
  "improving",
  "same",
  "worse",
]);

export type SymptomCheckInStatus = z.infer<typeof SymptomCheckInStatus>;

export const WorseningTrendTrigger = z.object({
  baselineWindowDays: z.number().int().positive().nullable().default(null),
  comparison: z.enum([
    "absolute_change",
    "persistent_days",
    "relative_change_pct",
    "target_breach_days",
    "target_offset",
  ]),
  direction: z.enum(["down", "up"]).nullable().default(null),
  metric: z.string(),
  notes: z.string(),
  thresholdDays: z.number().int().positive().nullable().default(null),
  thresholdPct: z.number().nullable().default(null),
  thresholdValue: z.number().nullable().default(null),
  windowDays: z.number().int().positive(),
});

export type WorseningTrendTrigger = z.infer<typeof WorseningTrendTrigger>;

export const WorseningTrendNotificationPlan = z.object({
  initialPush: z.boolean().default(true),
  repeatAtLocalTime: z.string().nullable().default(null),
  repeatUntil: z.string().nullable().default(null),
  templateKey: z.string(),
});

export type WorseningTrendNotificationPlan = z.infer<
  typeof WorseningTrendNotificationPlan
>;

export const WorseningTrendCheckInOption = z.object({
  code: z.string(),
  label: z.string(),
});

export type WorseningTrendCheckInOption = z.infer<
  typeof WorseningTrendCheckInOption
>;

export const WorseningTrendCheckInPrompt = z.object({
  options: z.array(WorseningTrendCheckInOption),
  question: z.string(),
});

export type WorseningTrendCheckInPrompt = z.infer<
  typeof WorseningTrendCheckInPrompt
>;

export const WorseningTrendRule = z.object({
  appNotification: WorseningTrendNotificationPlan.nullable().default(null),
  appTrigger: WorseningTrendTrigger,
  checkInPrompt: WorseningTrendCheckInPrompt.nullable().default(null),
  clinicianNotes: z.string(),
  key: WorseningTrendKey,
  label: z.string(),
  portalEscalation: z.array(WorseningTrendTrigger),
  portalHighPrioritySignals: z.array(z.string()).default([]),
  principle: z.string(),
});

export type WorseningTrendRule = z.infer<typeof WorseningTrendRule>;

export const PatientWorseningTrendAlert = z.object({
  body: z.string(),
  checkInResponseCode: z.string().nullable().default(null),
  checkInSubmittedAt: z.string().nullable().default(null),
  detail: z.string().nullable().default(null),
  detectedAt: z.string(),
  id: z.string(),
  key: WorseningTrendKey,
  level: WorseningEscalationLevel,
  portalEscalationEligible: z.boolean().default(false),
  repeatAtLocalTime: z.string().nullable().default(null),
  repeatUntil: z.string().nullable().default(null),
  screen: z.string(),
  title: z.string(),
});

export type PatientWorseningTrendAlert = z.infer<
  typeof PatientWorseningTrendAlert
>;

export const PatientWorseningTrendCheckInRequest = z.object({
  alertId: z.string().min(1),
  key: WorseningTrendKey,
  responseCode: z.string().min(1),
});

export type PatientWorseningTrendCheckInRequest = z.infer<
  typeof PatientWorseningTrendCheckInRequest
>;

export const PatientWorseningTrendCheckIn = z.object({
  alertId: z.string().min(1),
  createdAt: z.string(),
  key: WorseningTrendKey,
  orgId: z.string().min(1),
  patientId: z.string().min(1),
  principalId: z.string().min(1),
  promptQuestion: z.string().min(1),
  responseCode: z.string().min(1),
  responseLabel: z.string().min(1),
  submittedAt: z.string(),
  updatedAt: z.string(),
});

export type PatientWorseningTrendCheckIn = z.infer<
  typeof PatientWorseningTrendCheckIn
>;

export const PatientWorseningTrendAlertsResponse = z.object({
  items: z.array(PatientWorseningTrendAlert),
});

export type PatientWorseningTrendAlertsResponse = z.infer<
  typeof PatientWorseningTrendAlertsResponse
>;

export const WORSENING_TREND_RULES: Record<WorseningTrendKey, WorseningTrendRule> = {
  blood_pressure_up: {
    appNotification: {
      initialPush: true,
      repeatAtLocalTime: null,
      repeatUntil: null,
      templateKey: "blood_pressure_up_nudge",
    },
    appTrigger: {
      baselineWindowDays: 28,
      comparison: "relative_change_pct",
      direction: "up",
      metric: "blood_pressure_systolic",
      notes:
        "Trigger when the 7-day average systolic rises at least 15 mmHg above the previous 28-day average, or sits at least 10 mmHg above target.",
      thresholdDays: null,
      thresholdPct: null,
      thresholdValue: 15,
      windowDays: 7,
    },
    checkInPrompt: {
      options: [
        { code: "more_salty_food", label: "I have eaten more salty food" },
        { code: "missed_medication", label: "I have missed medication" },
        { code: "stress", label: "I have felt more stressed" },
        { code: "poor_sleep", label: "I have slept poorly" },
        { code: "illness", label: "I have been unwell" },
        { code: "headache", label: "I have headaches" },
        { code: "swelling", label: "I have swelling" },
        { code: "breathless", label: "I feel more breathless" },
        { code: "unknown", label: "I do not know why" },
      ],
      question:
        "Your blood pressure trend is higher than usual. Is there a likely reason for this?",
    },
    clinicianNotes:
      "Escalate when blood pressure remains above target or rises sharply enough to suggest sustained deterioration rather than a short fluctuation.",
    key: "blood_pressure_up",
    label: "Blood pressure up",
    portalEscalation: [
      {
        baselineWindowDays: 28,
        comparison: "relative_change_pct",
        direction: "up",
        metric: "blood_pressure_systolic",
        notes:
          "Escalate if the 7-day average systolic is at least 20 mmHg above the previous 28-day average and above target.",
        thresholdDays: null,
        thresholdPct: null,
        thresholdValue: 20,
        windowDays: 7,
      },
      {
        baselineWindowDays: null,
        comparison: "persistent_days",
        direction: "up",
        metric: "blood_pressure_above_target",
        notes:
          "Escalate if blood pressure remains above target for 14 days despite app nudges.",
        thresholdDays: 14,
        thresholdPct: null,
        thresholdValue: null,
        windowDays: 14,
      },
    ],
    portalHighPrioritySignals: [
      "weight_increase",
      "swelling",
      "breathless",
      "steps_decline",
    ],
    principle:
      "Use the app first for early blood pressure drift, but escalate sustained or clearly above-target deterioration.",
  },
  nutrition_worsening: {
    appNotification: {
      initialPush: true,
      repeatAtLocalTime: null,
      repeatUntil: null,
      templateKey: "nutrition_review_meals",
    },
    appTrigger: {
      baselineWindowDays: null,
      comparison: "target_breach_days",
      direction: "up",
      metric: "nutrition_targets_4_of_5",
      notes:
        "Trigger when 4 of 5 tracked nutrient targets are exceeded on at least 6 of the last 7 logged days.",
      thresholdDays: 6,
      thresholdPct: null,
      thresholdValue: 4,
      windowDays: 7,
    },
    checkInPrompt: null,
    clinicianNotes:
      "Escalate only for repeated target breaches across a longer window rather than a single poor intake day.",
    key: "nutrition_worsening",
    label: "Nutrition worsening",
    portalEscalation: [
      {
        baselineWindowDays: null,
        comparison: "target_breach_days",
        direction: "up",
        metric: "nutrition_targets_4_of_5",
        notes:
          "Escalate when 4 of 5 tracked nutrient targets are exceeded on at least 12 of the last 14 logged days.",
        thresholdDays: 12,
        thresholdPct: null,
        thresholdValue: 4,
        windowDays: 14,
      },
    ],
    portalHighPrioritySignals: [
      "weight_increase",
      "weight_decrease",
      "symptoms_worsening",
      "steps_decline",
      "blood_pressure_up",
      "fluid_worsening",
    ],
    principle:
      "Nutrition should usually stay app-managed unless the pattern is persistent or combines with other worsening signals.",
  },
  steps_decline: {
    appNotification: {
      initialPush: true,
      repeatAtLocalTime: "09:00",
      repeatUntil: "target_recovered_or_trend_normalised",
      templateKey: "steps_decline_daily_recovery",
    },
    appTrigger: {
      baselineWindowDays: 28,
      comparison: "relative_change_pct",
      direction: "down",
      metric: "steps_average",
      notes:
        "Trigger when the 7-day average steps are down at least 30% compared with the previous 28 days.",
      thresholdDays: null,
      thresholdPct: 30,
      thresholdValue: null,
      windowDays: 7,
    },
    checkInPrompt: null,
    clinicianNotes:
      "Use app nudges first because activity decline is often recoverable without clinician input if the patient re-engages promptly.",
    key: "steps_decline",
    label: "Activity down",
    portalEscalation: [
      {
        baselineWindowDays: null,
        comparison: "persistent_days",
        direction: "down",
        metric: "steps_below_target",
        notes:
          "Escalate if steps are still below target after 14 days.",
        thresholdDays: 14,
        thresholdPct: null,
        thresholdValue: null,
        windowDays: 14,
      },
      {
        baselineWindowDays: 28,
        comparison: "relative_change_pct",
        direction: "down",
        metric: "steps_average",
        notes:
          "Escalate if steps are still down at least 30% after 14 days.",
        thresholdDays: 14,
        thresholdPct: 30,
        thresholdValue: null,
        windowDays: 14,
      },
    ],
    portalHighPrioritySignals: ["symptoms_worsening", "weight_increase", "weight_decrease"],
    principle:
      "Compare the patient against their own baseline first, then only escalate if the decline persists.",
  },
  symptoms_worsening: {
    appNotification: {
      initialPush: true,
      repeatAtLocalTime: null,
      repeatUntil: null,
      templateKey: "symptom_check_in",
    },
    appTrigger: {
      baselineWindowDays: 7,
      comparison: "target_breach_days",
      direction: "up",
      metric: "symptom_days_or_frequency",
      notes:
        "Trigger an app-level check-in when symptoms are logged on at least 4 days in the last 7, materially exceed the previous 7 days, or the same symptom repeats across the week.",
      thresholdDays: 4,
      thresholdPct: null,
      thresholdValue: null,
      windowDays: 7,
    },
    checkInPrompt: {
      options: [
        { code: "improving", label: "Improving" },
        { code: "same", label: "Staying the same" },
        { code: "worse", label: "Getting worse" },
      ],
      question:
        "You have logged more symptoms this week. Are they improving, staying the same, or getting worse?",
    },
    clinicianNotes:
      "Symptoms matter more when they persist, become moderate or severe, or appear alongside weight, nutrition, or activity deterioration.",
    key: "symptoms_worsening",
    label: "More symptoms reported",
    portalEscalation: [
      {
        baselineWindowDays: null,
        comparison: "persistent_days",
        direction: "up",
        metric: "symptoms_persisting",
        notes:
          "Escalate if symptoms persist or increase across 14 days.",
        thresholdDays: 14,
        thresholdPct: null,
        thresholdValue: null,
        windowDays: 14,
      },
    ],
    portalHighPrioritySignals: [
      "weight_increase",
      "weight_decrease",
      "steps_decline",
      "nutrition_worsening",
    ],
    principle:
      "Use symptoms as a force multiplier: they often turn an otherwise app-manageable trend into a clinician-visible problem.",
  },
  weight_decrease: {
    appNotification: {
      initialPush: true,
      repeatAtLocalTime: null,
      repeatUntil: null,
      templateKey: "weight_decrease_check_in",
    },
    appTrigger: {
      baselineWindowDays: null,
      comparison: "absolute_change",
      direction: "down",
      metric: "weight_kg",
      notes:
        "Trigger when weight decreases by at least 2 kg over 7 days.",
      thresholdDays: null,
      thresholdPct: null,
      thresholdValue: 2,
      windowDays: 7,
    },
    checkInPrompt: {
      options: [
        { code: "intentional_weight_loss", label: "I am intentionally trying to lose weight" },
        { code: "poor_appetite", label: "I have had poor appetite" },
        { code: "nausea", label: "I have felt sick or nauseous" },
        { code: "vomiting", label: "I have had vomiting" },
        { code: "diarrhoea", label: "I have had diarrhoea" },
        { code: "unwell", label: "I have been unwell" },
        { code: "other_symptoms", label: "I have other symptoms" },
        { code: "unknown", label: "I do not know why" },
      ],
      question:
        "Your weight has decreased by 2 kg or more over the last 7 days. Is there a likely reason for this?",
    },
    clinicianNotes:
      "Unexplained or symptom-linked weight loss can be important sooner than isolated, intentional weight loss.",
    key: "weight_decrease",
    label: "Weight decrease",
    portalEscalation: [
      {
        baselineWindowDays: null,
        comparison: "absolute_change",
        direction: "down",
        metric: "weight_kg",
        notes:
          "Escalate immediately if weight decreases by at least 4 kg over 7 days.",
        thresholdDays: null,
        thresholdPct: null,
        thresholdValue: 4,
        windowDays: 7,
      },
      {
        baselineWindowDays: null,
        comparison: "persistent_days",
        direction: "down",
        metric: "weight_kg",
        notes:
          "Escalate if a 2 kg or greater weight decrease continues across 14 days.",
        thresholdDays: 14,
        thresholdPct: null,
        thresholdValue: 2,
        windowDays: 14,
      },
    ],
    portalHighPrioritySignals: ["symptoms_worsening", "nutrition_worsening"],
    principle:
      "Keep 2 kg over 7 days as the app trigger, then escalate only when the loss is severe, sustained, unexplained, or symptom-linked.",
  },
  weight_increase: {
    appNotification: {
      initialPush: true,
      repeatAtLocalTime: null,
      repeatUntil: null,
      templateKey: "weight_increase_check_in",
    },
    appTrigger: {
      baselineWindowDays: null,
      comparison: "absolute_change",
      direction: "up",
      metric: "weight_kg",
      notes:
        "Trigger when weight increases by at least 2 kg over 7 days.",
      thresholdDays: null,
      thresholdPct: null,
      thresholdValue: 2,
      windowDays: 7,
    },
    checkInPrompt: {
      options: [
        { code: "holiday", label: "I have been on holiday" },
        { code: "ate_more", label: "I have eaten more than usual" },
        { code: "more_salty_food", label: "I have eaten more salty food" },
        { code: "more_fluid", label: "I have been drinking more fluid" },
        { code: "missed_tasks", label: "I have missed some care-plan tasks" },
        { code: "trying_to_gain_weight", label: "I am trying to gain weight" },
        { code: "swelling", label: "I have swelling" },
        { code: "breathless", label: "I feel more breathless" },
        { code: "less_urine", label: "I am passing less urine" },
        { code: "other_worsening_symptoms", label: "I have other worsening symptoms" },
        { code: "unknown", label: "I do not know why" },
      ],
      question:
        "Your weight has increased by 2 kg or more over the last 7 days. Is there a likely reason for this?",
    },
    clinicianNotes:
      "Do not raise the app trigger to 5 kg; use context to distinguish expected change from concerning, unexplained gain.",
    key: "weight_increase",
    label: "Weight increase",
    portalEscalation: [
      {
        baselineWindowDays: null,
        comparison: "absolute_change",
        direction: "up",
        metric: "weight_kg",
        notes:
          "Escalate immediately if weight increases by at least 4 kg over 7 days.",
        thresholdDays: null,
        thresholdPct: null,
        thresholdValue: 4,
        windowDays: 7,
      },
      {
        baselineWindowDays: null,
        comparison: "persistent_days",
        direction: "up",
        metric: "weight_kg",
        notes:
          "Escalate if a 2 kg or greater weight increase continues for another 7 days.",
        thresholdDays: 14,
        thresholdPct: null,
        thresholdValue: 2,
        windowDays: 14,
      },
    ],
    portalHighPrioritySignals: [
      "swelling",
      "breathless",
      "less_urine",
      "blood_pressure_up",
      "symptoms_worsening",
    ],
    principle:
      "Keep 2 kg over 7 days as the app trigger, then escalate when the gain is severe, unexplained, sustained, repeated, or linked with symptoms.",
  },
};
