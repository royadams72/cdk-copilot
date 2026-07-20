export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import {
  DIETARY_PREFERENCE_OPTIONS,
  ENVIRONMENTAL_ALLERGENS,
  FOOD_ALLERGENS,
  LATEX_ALLERGENS,
  type TAllergyFormItem,
  type TDietaryPreferenceFormItem,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

import { actorTypeFromRole } from "@/apps/api/lib/audit/actors";
import type { HealthProfilesCurrentDoc } from "@/apps/api/lib/health-profiles/shared";
import { loadAccessiblePortalPatient } from "@/apps/api/lib/portal/loadAccessiblePatient";
import { mapPortalPatientDetail } from "@/apps/api/lib/portal/patients";
import {
  ensurePatientTargetsSeeded,
  findTargetsCurrentDoc,
  isStructuredTargetState,
} from "@/apps/api/lib/utils/targets";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";

type TargetDefinitionValue = {
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  type: "range" | "max" | "min" | "exact";
  value?: number | null;
};

type TargetMeta = {
  reason?: string | null;
  setAt: Date;
  setBy: {
    actorType: "user" | "clinician" | "system";
    displayName?: string | null;
    principalId: string;
  };
} | null;

type TargetMetricState = {
  careTeamTarget?: TargetDefinitionValue | null;
  careTeamTargetMeta?: TargetMeta;
  domain: "renal" | "lifestyle";
  effective: TargetDefinitionValue;
  metric: string;
  override?: TargetDefinitionValue | null;
  overrideMeta?: TargetMeta;
  personalGoal?: TargetDefinitionValue | null;
  personalGoalMeta?: TargetMeta;
  recommended: TargetDefinitionValue;
  unit: string;
};

type TargetsCurrentDoc = {
  _id: ObjectId;
  orgId?: string | null;
  patientId: ObjectId | string;
  targets: Record<string, TargetMetricState>;
};

type PortalNutritionHealthProfileDoc = HealthProfilesCurrentDoc & {
  dietaryRestrictions?: string[];
  fluidLimitLitres?: number | null;
  notesFromDietitian?: string | null;
  renalDietGuidance?: string | null;
  reviewDueDate?: Date | null;
};

const NutritionProfilePayload = z
  .object({
    allergyIntolerances: z.array(z.string().trim().min(1)).default([]),
    dietaryRestrictions: z.array(z.string().trim().min(1)).default([]),
    fluidLimitLitres: z.number().positive().nullable().optional(),
    notesFromDietitian: z.string().trim().nullable().optional(),
    renalDietGuidance: z.string().trim().nullable().optional(),
    reviewDueDate: z.iso.date().nullable().optional(),
  })
  .strict();

function cleanNullableText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function humanizeMetric(metric: string) {
  const labels: Record<string, string> = {
    caloriesKcal: "Calories",
    phosphorusMg: "Phosphorus",
    potassiumMg: "Potassium",
    proteinG: "Protein",
    sodiumMg: "Sodium",
  };
  return labels[metric] ?? metric.replace(/_/g, " ");
}

const dietaryPreferenceByLabel = new Map(
  DIETARY_PREFERENCE_OPTIONS.map((option) => [option.label.toLowerCase(), option]),
);

function findNestedAllergy(
  options: readonly {
    key: string;
    label: string;
    children?: readonly { key: string; label: string }[];
  }[],
  label: string,
  group: "food" | "environmental",
): TAllergyFormItem | null {
  const normalized = label.trim().toLowerCase();
  for (const option of options) {
    if (option.label.toLowerCase() === normalized) {
      return {
        group,
        key: option.key,
        label: option.label,
        severity: "unknown",
      };
    }
    for (const child of option.children ?? []) {
      if (child.label.toLowerCase() === normalized) {
        return {
          childKey: child.key,
          childLabel: child.label,
          group,
          key: option.key,
          label: option.label,
          severity: "unknown",
        };
      }
    }
  }
  return null;
}

function toAllergyFormItem(label: string): TAllergyFormItem {
  const normalized = label.trim();
  return (
    findNestedAllergy(FOOD_ALLERGENS, normalized, "food") ??
    findNestedAllergy(ENVIRONMENTAL_ALLERGENS, normalized, "environmental") ??
    (() => {
      const latex = LATEX_ALLERGENS.find(
        (option) => option.label.toLowerCase() === normalized.toLowerCase(),
      );
      if (latex) {
        return {
          group: "latex" as const,
          key: latex.key,
          label: latex.label,
          severity: "unknown" as const,
        };
      }
      return {
        group: "other" as const,
        key: "other",
        label: normalized,
        severity: "unknown" as const,
      };
    })()
  );
}

function getAllergyDisplayLabel(allergy: TAllergyFormItem) {
  return "childLabel" in allergy && allergy.childLabel
    ? allergy.childLabel
    : allergy.label;
}

function toExistingAllergyMap(current: HealthProfilesCurrentDoc | null) {
  return new Map(
    (current?.allergies ?? []).map((entry) => [
      getAllergyDisplayLabel(entry.value.allergy).trim().toLowerCase(),
      entry.value.allergy,
    ]),
  );
}

function toDietaryPreferenceItems(
  values: string[],
): {
  dietaryPreferences: TDietaryPreferenceFormItem[];
  dietaryRestrictions: string[];
} {
  const dietaryPreferences: TDietaryPreferenceFormItem[] = [];
  const dietaryRestrictions: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const matched = dietaryPreferenceByLabel.get(normalized.toLowerCase());
    if (matched) {
      dietaryPreferences.push({ key: matched.key, label: matched.label });
    } else if (normalized) {
      dietaryRestrictions.push(normalized);
    }
  }

  return { dietaryPreferences, dietaryRestrictions };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const { patientId } = await context.params;
    const loaded = await loadAccessiblePortalPatient(req, patientId);
    if (loaded.error || !loaded.db || !loaded.patient || !loaded.patientObjectId) {
      return loaded.error;
    }

    await ensurePatientTargetsSeeded(loaded.db, {
      orgId: loaded.caller.orgId,
      patientId: loaded.patientObjectId,
      seedPrincipalId: loaded.caller.principalId,
    });

    const [profileDoc, currentDoc] = await Promise.all([
      loaded.db
        .collection<PortalNutritionHealthProfileDoc>(
          COLLECTIONS.HealthProfilesCurrent,
        )
        .findOne({ patientId: loaded.patientObjectId }),
      findTargetsCurrentDoc(loaded.db, loaded.patientObjectId) as Promise<TargetsCurrentDoc | null>,
    ]);

    const nutritionTargets = Object.entries(currentDoc?.targets ?? {})
      .filter(([, state]) => isStructuredTargetState(state))
      .filter(([, state]) => state.domain === "renal")
      .sort(([left], [right]) => humanizeMetric(left).localeCompare(humanizeMetric(right)))
      .map(([metric, state]) => ({
        domain: state.domain,
        label: humanizeMetric(metric),
        metric,
        state: {
          careTeamTarget: state.careTeamTarget ?? null,
          careTeamTargetMeta: state.careTeamTargetMeta
            ? {
                reason: state.careTeamTargetMeta.reason ?? null,
                setAt: state.careTeamTargetMeta.setAt.toISOString(),
                setBy: state.careTeamTargetMeta.setBy,
              }
            : null,
          effective: state.effective,
          override: state.override ?? null,
          overrideMeta: state.overrideMeta
            ? {
                reason: state.overrideMeta.reason ?? null,
                setAt: state.overrideMeta.setAt.toISOString(),
                setBy: state.overrideMeta.setBy,
              }
            : null,
          personalGoal: state.personalGoal ?? null,
          personalGoalMeta: state.personalGoalMeta
            ? {
                reason: state.personalGoalMeta.reason ?? null,
                setAt: state.personalGoalMeta.setAt.toISOString(),
                setBy: state.personalGoalMeta.setBy,
              }
            : null,
          recommended: state.recommended,
          unit: state.unit,
        },
      }));

    return ok({
      nutritionTargets,
      patient: mapPortalPatientDetail(loaded.patient),
      profile: {
        allergyIntolerances:
          profileDoc?.allergies.map((entry) =>
            getAllergyDisplayLabel(entry.value.allergy),
          ) ?? [],
        dietaryRestrictions: uniqueStrings([
          ...(profileDoc?.dietaryPreferences.map(
            (entry) => entry.value.dietaryPreference.label,
          ) ?? []),
          ...(profileDoc?.dietaryRestrictions ?? []),
        ]),
        fluidLimitLitres: profileDoc?.fluidLimitLitres ?? null,
        notesFromDietitian: profileDoc?.notesFromDietitian ?? null,
        renalDietGuidance: profileDoc?.renalDietGuidance ?? null,
        reviewDueDate: profileDoc?.reviewDueDate
          ? profileDoc.reviewDueDate.toISOString().slice(0, 10)
          : null,
      },
    });
  } catch (error: any) {
    return badFromError(error, "Unable to load renal nutrition profile");
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const { patientId } = await context.params;
    const loaded = await loadAccessiblePortalPatient(req, patientId);
    if (loaded.error || !loaded.db || !loaded.patientObjectId) {
      return loaded.error;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = NutritionProfilePayload.safeParse(body);
    if (!parsed.success) {
      return bad(
        "Invalid renal nutrition profile",
        { issues: parsed.error.flatten() },
        400,
      );
    }

    const now = new Date();
    const actor = {
      actorType: actorTypeFromRole(loaded.caller.role),
      displayName: null,
      principalId: loaded.caller.principalId,
    } as const;

    const currentCollection =
      loaded.db.collection<PortalNutritionHealthProfileDoc>(
        COLLECTIONS.HealthProfilesCurrent,
      );
    const current = await currentCollection.findOne({
      patientId: loaded.patientObjectId,
    });
    const existingAllergyMap = toExistingAllergyMap(current);

    const nextReviewDueDate = parsed.data.reviewDueDate
      ? new Date(`${parsed.data.reviewDueDate}T00:00:00.000Z`)
      : null;
    const nextAllergies = uniqueStrings(parsed.data.allergyIntolerances).map((label) => {
      const existing = existingAllergyMap.get(label.trim().toLowerCase());
      return existing ?? toAllergyFormItem(label);
    });
    const nextDietary = toDietaryPreferenceItems(
      uniqueStrings(parsed.data.dietaryRestrictions),
    );
    const nextOrgId = loaded.caller.orgId ?? current?.orgId;
    const nextAllergyEntries = nextAllergies.map((allergy, index) => ({
      entryId: `hp_allergy_portal_${index}_${allergy.group}_${allergy.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      value: { allergy, kind: "allergy" as const },
    }));
    const nextDietaryPreferenceEntries = nextDietary.dietaryPreferences.map(
      (dietaryPreference) => ({
        entryId: `hp_diet_${dietaryPreference.key}`,
        value: {
          dietaryPreference,
          kind: "dietary_preference" as const,
        },
      }),
    );
    const nextNotesFromDietitian =
      cleanNullableText(parsed.data.notesFromDietitian);
    const nextRenalDietGuidance =
      cleanNullableText(parsed.data.renalDietGuidance);

    await currentCollection
      .updateOne(
        { patientId: loaded.patientObjectId },
        {
          $set: {
            allergies: nextAllergyEntries,
            dietaryPreferences: nextDietaryPreferenceEntries,
            dietaryRestrictions: nextDietary.dietaryRestrictions,
            fluidLimitLitres: parsed.data.fluidLimitLitres ?? null,
            notesFromDietitian: nextNotesFromDietitian,
            renalDietGuidance: nextRenalDietGuidance,
            reviewDueDate: nextReviewDueDate,
            updatedAt: now,
            updatedBy: actor,
            ...(nextOrgId ? { orgId: nextOrgId } : {}),
          },
          $setOnInsert: {
            createdAt: now,
            createdBy: actor,
            conditions: current?.conditions ?? [],
            patientId: loaded.patientObjectId,
          },
        },
        { upsert: true },
      );

    return ok({
      message: "Renal nutrition profile updated",
      updatedAt: now.toISOString(),
    });
  } catch (error: any) {
    return badFromError(error, "Unable to update renal nutrition profile");
  }
}
