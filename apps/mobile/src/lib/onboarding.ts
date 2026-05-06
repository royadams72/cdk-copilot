import { ONBOARDING_STEPS } from "@ckd/core";

import { secureStorage } from "./secureStorage";

export const ONBOARDING_ROUTES = {
  clinical: "/(auth)/onboarding/clinical-form",
  dashboard: "/(dashboard)/dashboard",
  pii: "/(auth)/onboarding/pii-form",
} as const;

const PII_DRAFT_KEY = "onboarding.pii.draft";
const CLINICAL_DRAFT_KEY = "onboarding.clinical.draft";

async function loadDraft<T>(key: string): Promise<Partial<T> | null> {
  const raw = await secureStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Partial<T>;
  } catch {
    await secureStorage.removeItem(key);
    return null;
  }
}

async function saveDraft<T>(key: string, value: Partial<T>) {
  await secureStorage.setItem(key, JSON.stringify(value));
}

export function resolveOnboardingRoute(
  onboardingCompleted?: boolean,
  onboardingSteps?: string[] | null,
) {
  if (onboardingCompleted) {
    return ONBOARDING_ROUTES.dashboard;
  }

  if (onboardingSteps?.includes(ONBOARDING_STEPS.Pii)) {
    return ONBOARDING_ROUTES.clinical;
  }

  return ONBOARDING_ROUTES.pii;
}

export const onboardingDrafts = {
  clearClinicalDraft: () => secureStorage.removeItem(CLINICAL_DRAFT_KEY),
  clearPiiDraft: () => secureStorage.removeItem(PII_DRAFT_KEY),
  loadClinicalDraft: <T>() => loadDraft<T>(CLINICAL_DRAFT_KEY),
  loadPiiDraft: <T>() => loadDraft<T>(PII_DRAFT_KEY),
  saveClinicalDraft: <T>(value: Partial<T>) => saveDraft(CLINICAL_DRAFT_KEY, value),
  savePiiDraft: <T>(value: Partial<T>) => saveDraft(PII_DRAFT_KEY, value),
};
