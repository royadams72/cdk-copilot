import { ONBOARDING_STEPS } from "@ckd/core";

import { secureStorage } from "./secureStorage";

export const ONBOARDING_ROUTES = {
  accessEnded: "/(auth)/access-ended",
  consent: "/(auth)/consent",
  clinical: "/(auth)/onboarding/clinical-form",
  dashboard: "/(dashboard)/dashboard",
  pii: "/(auth)/onboarding/pii-form",
} as const;

type PostAuthRouteArgs = {
  activeAssignmentCount?: number | null;
  hasActiveAssignments?: boolean | null;
  hasPendingConsents?: boolean | null;
  onboardingCompleted?: boolean;
  onboardingSteps?: string[] | null;
};

export type PostAuthRouteDecisionReason =
  | "membership-inactive"
  | "pending-consents"
  | "onboarding-complete"
  | "onboarding-incomplete";

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

export function getPostAuthRouteDecision(args: PostAuthRouteArgs) {
  if (args.hasPendingConsents) {
    return {
      reason: "pending-consents" as const,
      route: ONBOARDING_ROUTES.consent,
    };
  }

  if (args.hasActiveAssignments === false) {
    return {
      reason: "membership-inactive" as const,
      route: ONBOARDING_ROUTES.accessEnded,
    };
  }

  const route = resolveOnboardingRoute(
    args.onboardingCompleted,
    args.onboardingSteps,
  );

  return {
    reason:
      route === ONBOARDING_ROUTES.dashboard
        ? ("onboarding-complete" as const)
        : ("onboarding-incomplete" as const),
    route,
  };
}

export function logPostAuthRouteDecision(
  source: string,
  args: PostAuthRouteArgs,
) {
  if (!__DEV__) {
    return;
  }

  const decision = getPostAuthRouteDecision(args);
  console.log(`[post-auth-route:${source}]`, {
    activeAssignmentCount: args.activeAssignmentCount ?? null,
    hasActiveAssignments: args.hasActiveAssignments ?? null,
    hasPendingConsents: args.hasPendingConsents ?? null,
    onboardingCompleted: args.onboardingCompleted ?? null,
    onboardingSteps: args.onboardingSteps ?? [],
    reason: decision.reason,
    route: decision.route,
  });
}

export function resolvePostAuthRoute(args: PostAuthRouteArgs) {
  return getPostAuthRouteDecision(args).route;
}

export const onboardingDrafts = {
  clearClinicalDraft: () => secureStorage.removeItem(CLINICAL_DRAFT_KEY),
  clearPiiDraft: () => secureStorage.removeItem(PII_DRAFT_KEY),
  loadClinicalDraft: <T>() => loadDraft<T>(CLINICAL_DRAFT_KEY),
  loadPiiDraft: <T>() => loadDraft<T>(PII_DRAFT_KEY),
  saveClinicalDraft: <T>(value: Partial<T>) => saveDraft(CLINICAL_DRAFT_KEY, value),
  savePiiDraft: <T>(value: Partial<T>) => saveDraft(PII_DRAFT_KEY, value),
};
