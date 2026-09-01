import type { Href } from "expo-router";

// Centralize the app routes we reuse so navigation paths stay consistent.
// `access-ended` is missing from generated Expo route types right now, so the cast
// is isolated here instead of repeated at each call site.
export const APP_ROUTES = {
  accessEnded: "/(auth)/access-ended" as Href,
  checkEmail: "/(auth)/check-email",
  clinicalOnboarding: "/(auth)/onboarding/clinical-form",
  consent: "/(auth)/consent",
  dashboard: "/(dashboard)/dashboard",
  healthDashboard: "/(fitness)/fitness-details",
  nutritionDetails: "/(nutrition)/nutrition-details",
  piiOnboarding: "/(auth)/onboarding/pii-form",
  welcome: "/(init-app)/welcome",
} as const;

export const ONBOARDING_ROUTES = {
  accessEnded: APP_ROUTES.accessEnded,
  clinical: APP_ROUTES.clinicalOnboarding,
  consent: APP_ROUTES.consent,
  dashboard: APP_ROUTES.dashboard,
  pii: APP_ROUTES.piiOnboarding,
} as const;
