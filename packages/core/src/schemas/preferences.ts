import { z } from "zod";

export const PreferencesKeys = [
  "workoutType",
  "equipmentAvailability",
  "timePerSession",
  "daysPerWeek",
  "workoutTime",
  "socialPreference",
] as const;

export const PreferencesKey = z.enum(PreferencesKeys);
export type TPreferencesKey = (typeof PreferencesKeys)[number];

export const PreferencesSchema = z.object({
  workoutType: z.array(z.string()),
  equipmentAvailability: z.string(),
  timePerSession: z.string(),
  daysPerWeek: z.string(),
  workoutTime: z.string(),
  socialPreference: z.string(),
});

export const defaultPreferences: Record<TPreferencesKey, string | string[]> = {
  workoutType: [],
  equipmentAvailability: "",
  timePerSession: "",
  daysPerWeek: "",
  workoutTime: "",
  socialPreference: "",
};

export type TPreferences = z.infer<typeof PreferencesSchema>;
