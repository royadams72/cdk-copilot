import {
  HealthProfileLedgerEventDoc,
  HealthProfilesCurrentDoc,
  makeStableProfileKey,
  normalizeProfileLabel,
  toConditionCurrentEntry,
} from "@/apps/api/lib/health-profiles/shared";
import {
  AllergyFormItem,
  DietaryPreferenceFormItem,
  HealthProfilesUpsertRequest,
  HealthProfileValue,
} from "@/packages/core/dist/isomorphic";
import { ObjectId } from "mongodb";
import z from "zod";

type TAllergyFormItem = z.infer<typeof AllergyFormItem>;
type TDietaryPreferenceFormItem = z.infer<typeof DietaryPreferenceFormItem>;
type THealthProfileFormValues = z.infer<typeof HealthProfilesUpsertRequest>;
type THealthProfileValue = z.infer<typeof HealthProfileValue>;
type TAllergyCurrentEntry = HealthProfilesCurrentDoc["allergies"][number];
type TDietaryPreferenceCurrentEntry =
  HealthProfilesCurrentDoc["dietaryPreferences"][number];

const emptyHealthProfileFormValues: THealthProfileFormValues = {
  allergies: [],
  conditions: [],
  dietaryPreferences: [],
};

export function makeAllergyEntryId(item: TAllergyFormItem) {
  switch (item.group) {
    case "food":
      return `hp_allergy_${makeStableProfileKey([
        "food",
        item.key,
        item.childKey ?? "",
      ])}`;
    case "environmental":
      return `hp_allergy_${makeStableProfileKey([
        "environmental",
        item.key,
        item.childKey ?? "",
      ])}`;
    case "latex":
      return `hp_allergy_${makeStableProfileKey(["latex", item.key])}`;
    case "medication":
      return `hp_allergy_${makeStableProfileKey([
        "medication",
        item.medicationRefId ?? "",
        item.dmplusdCode ?? "",
        item.snomedCode ?? "",
        item.medicationCode ?? "",
        normalizeProfileLabel(item.label),
      ])}`;
    case "other":
      return `hp_allergy_${makeStableProfileKey(["other", normalizeProfileLabel(item.label)])}`;
  }
}

export function makeDietaryPreferenceEntryId(item: TDietaryPreferenceFormItem) {
  return `hp_diet_${makeStableProfileKey([item.key])}`;
}

export function toAllergyCurrentEntry(
  allergy: TAllergyFormItem,
): TAllergyCurrentEntry {
  return {
    entryId: makeAllergyEntryId(allergy),
    value: { allergy, kind: "allergy" },
  };
}

export function toDietaryPreferenceCurrentEntry(
  dietaryPreference: TDietaryPreferenceFormItem,
): TDietaryPreferenceCurrentEntry {
  return {
    entryId: makeDietaryPreferenceEntryId(dietaryPreference),
    value: { dietaryPreference, kind: "dietary_preference" },
  };
}

export function sortEntries<TEntry extends { entryId: string }>(
  entries: TEntry[],
) {
  return [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId));
}

export function buildCurrentEntries(values: THealthProfileFormValues) {
  return {
    allergies: sortEntries(
      values.allergies.map((allergy) => toAllergyCurrentEntry(allergy)),
    ),
    conditions: sortEntries(
      values.conditions.map((condition) => toConditionCurrentEntry(condition)),
    ),
    dietaryPreferences: sortEntries(
      values.dietaryPreferences.map((dietaryPreference) =>
        toDietaryPreferenceCurrentEntry(dietaryPreference),
      ),
    ),
  };
}

export function currentDocToFormValues(
  current: HealthProfilesCurrentDoc | null,
): THealthProfileFormValues {
  if (!current) return emptyHealthProfileFormValues;

  return {
    allergies: current.allergies.map((entry) => entry.value.allergy),
    conditions: current.conditions.map((entry) => entry.value.condition),
    dietaryPreferences: current.dietaryPreferences.map(
      (entry) => entry.value.dietaryPreference,
    ),
  };
}

export function toComparableValue(value: THealthProfileValue) {
  return JSON.stringify(value);
}

export function buildLedgerEvents(params: {
  actor: HealthProfileLedgerEventDoc["createdBy"];
  currentEntries: ReturnType<typeof buildCurrentEntries>;
  now: Date;
  orgId?: string;
  patientId: ObjectId;
  previous: HealthProfilesCurrentDoc | null;
}) {
  const { actor, currentEntries, now, orgId, patientId, previous } = params;
  const previousEntries = sortEntries([
    ...(previous?.allergies ?? []),
    ...(previous?.dietaryPreferences ?? []),
    ...(previous?.conditions ?? []),
  ]);
  const nextEntries = sortEntries([
    ...currentEntries.allergies,
    ...currentEntries.dietaryPreferences,
    ...currentEntries.conditions,
  ]);

  const previousMap = new Map(
    previousEntries.map((entry) => [entry.entryId, entry]),
  );
  const nextMap = new Map(nextEntries.map((entry) => [entry.entryId, entry]));
  const events: HealthProfileLedgerEventDoc[] = [];

  for (const [entryId, nextEntry] of nextMap) {
    const prevEntry = previousMap.get(entryId);
    if (!prevEntry) {
      events.push({
        _id: new ObjectId(),
        after: nextEntry.value,
        before: null,
        createdAt: now,
        createdBy: actor,
        entryId,
        eventType: "created",
        ...(orgId ? { orgId } : {}),
        patientId,
        superseded: false,
      });
      continue;
    }

    if (
      toComparableValue(prevEntry.value) === toComparableValue(nextEntry.value)
    ) {
      continue;
    }

    events.push({
      _id: new ObjectId(),
      after: nextEntry.value,
      before: prevEntry.value,
      createdAt: now,
      createdBy: actor,
      entryId,
      eventType: "updated",
      ...(orgId ? { orgId } : {}),
      patientId,
      superseded: false,
    });
  }

  for (const [entryId, prevEntry] of previousMap) {
    if (nextMap.has(entryId)) continue;
    events.push({
      _id: new ObjectId(),
      after: null,
      before: prevEntry.value,
      createdAt: now,
      createdBy: actor,
      entryId,
      eventType: "removed",
      ...(orgId ? { orgId } : {}),
      patientId,
      superseded: false,
    });
  }

  return events;
}
