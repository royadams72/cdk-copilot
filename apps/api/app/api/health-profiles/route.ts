export const runtime = "nodejs";

import { createHash } from "crypto";

import {
  AllergyFormItem,
  ConditionFormItem,
  DietaryPreferenceFormItem,
  HealthProfilesCurrent,
  HealthProfilesUpsertRequest,
  HealthProfileCurrentEntry,
  HealthProfileLedgerEvent,
  HealthProfileValue,
  ROLES,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { treeifyError, z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";

type TAllergyFormItem = z.infer<typeof AllergyFormItem>;
type TConditionFormItem = z.infer<typeof ConditionFormItem>;
type TDietaryPreferenceFormItem = z.infer<typeof DietaryPreferenceFormItem>;
type THealthProfileCurrent = z.infer<typeof HealthProfilesCurrent>;
type THealthProfileCurrentEntry = z.infer<typeof HealthProfileCurrentEntry>;
type THealthProfileFormValues = z.infer<typeof HealthProfilesUpsertRequest>;
type THealthProfileLedgerEvent = z.infer<typeof HealthProfileLedgerEvent>;
type THealthProfileValue = z.infer<typeof HealthProfileValue>;
type TAllergyCurrentEntry = THealthProfileCurrent["allergies"][number];
type TConditionCurrentEntry = THealthProfileCurrent["conditions"][number];
type TDietaryPreferenceCurrentEntry =
  THealthProfileCurrent["dietaryPreferences"][number];

type HealthProfilesCurrentDoc = Omit<THealthProfileCurrent, "patientId"> & {
  patientId: ObjectId;
};

type HealthProfileLedgerEventDoc = Omit<
  THealthProfileLedgerEvent,
  "_id" | "correctionOf" | "patientId"
> & {
  _id: ObjectId;
  correctionOf?: ObjectId | null;
  patientId: ObjectId;
};

const emptyHealthProfileFormValues: THealthProfileFormValues = {
  allergies: [],
  conditions: [],
  dietaryPreferences: [],
};

function actorTypeFromRole(role: string) {
  if (role === ROLES.Patient) return "patient";
  if (role === ROLES.Clinician) return "clinician";
  if (role === ROLES.Dietitian) return "dietitian";
  if (role === "admin") return "admin";
  return "system";
}

function stableKey(parts: string[]) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function makeAllergyEntryId(item: TAllergyFormItem) {
  switch (item.group) {
    case "food":
      return `hp_allergy_${stableKey([
        "food",
        item.key,
        item.childKey ?? "",
      ])}`;
    case "environmental":
      return `hp_allergy_${stableKey([
        "environmental",
        item.key,
        item.childKey ?? "",
      ])}`;
    case "latex":
      return `hp_allergy_${stableKey(["latex", item.key])}`;
    case "medication":
      return `hp_allergy_${stableKey([
        "medication",
        item.medicationRefId ?? "",
        item.dmplusdCode ?? "",
        item.snomedCode ?? "",
        item.medicationCode ?? "",
        normalizeLabel(item.label),
      ])}`;
    case "other":
      return `hp_allergy_${stableKey(["other", normalizeLabel(item.label)])}`;
  }
}

function makeDietaryPreferenceEntryId(item: TDietaryPreferenceFormItem) {
  return `hp_diet_${stableKey([item.key])}`;
}

function makeConditionEntryId(item: TConditionFormItem) {
  return `hp_condition_${stableKey([
    item.codeSystem,
    item.code,
    normalizeLabel(item.label),
  ])}`;
}

function toAllergyCurrentEntry(allergy: TAllergyFormItem): TAllergyCurrentEntry {
  return {
    entryId: makeAllergyEntryId(allergy),
    value: { allergy, kind: "allergy" },
  };
}

function toDietaryPreferenceCurrentEntry(
  dietaryPreference: TDietaryPreferenceFormItem,
): TDietaryPreferenceCurrentEntry {
  return {
    entryId: makeDietaryPreferenceEntryId(dietaryPreference),
    value: { dietaryPreference, kind: "dietary_preference" },
  };
}

function toConditionCurrentEntry(
  condition: TConditionFormItem,
): TConditionCurrentEntry {
  return {
    entryId: makeConditionEntryId(condition),
    value: { condition, kind: "condition" },
  };
}

function sortEntries<TEntry extends { entryId: string }>(entries: TEntry[]) {
  return [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId));
}

function buildCurrentEntries(values: THealthProfileFormValues) {
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

function currentDocToFormValues(
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

function toComparableValue(value: THealthProfileValue) {
  return JSON.stringify(value);
}

function buildLedgerEvents(params: {
  actor: THealthProfileLedgerEvent["createdBy"];
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

  const previousMap = new Map(previousEntries.map((entry) => [entry.entryId, entry]));
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

    if (toComparableValue(prevEntry.value) === toComparableValue(nextEntry.value)) {
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

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const current = await db
      .collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent)
      .findOne({ patientId: new ObjectId(caller.patientId) });

    return ok({
      formValues: currentDocToFormValues(current),
      updatedAt: current?.updatedAt ?? null,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = HealthProfilesUpsertRequest.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", treeifyError(parsed.error), 400);
    }

    const db = await getDb();
    const now = new Date();
    const patientId = new ObjectId(caller.patientId);
    const actor = {
      actorType: actorTypeFromRole(caller.role),
      principalId: caller.principalId,
    } as const;

    const previous = await db
      .collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent)
      .findOne({ patientId });

    const currentEntries = buildCurrentEntries(parsed.data);
    const currentDoc = {
      allergies: currentEntries.allergies,
      conditions: currentEntries.conditions,
      createdAt: previous?.createdAt ?? now,
      createdBy: previous?.createdBy ?? actor,
      dietaryPreferences: currentEntries.dietaryPreferences,
      ...(caller.orgId ? { orgId: caller.orgId } : {}),
      patientId,
      updatedAt: now,
      updatedBy: actor,
    } satisfies HealthProfilesCurrentDoc;

    const currentValidation = HealthProfilesCurrent.safeParse({
      ...currentDoc,
      patientId: caller.patientId,
    });
    if (!currentValidation.success) {
      return bad("Validation failed", treeifyError(currentValidation.error), 400);
    }

    const events = buildLedgerEvents({
      actor,
      currentEntries,
      now,
      orgId: caller.orgId,
      patientId,
      previous,
    });

    if (events.length > 0) {
      await db
        .collection<HealthProfileLedgerEventDoc>(COLLECTIONS.HealthProfilesLedger)
        .insertMany(events, { ordered: true });
    }

    await db.collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent).updateOne(
      { patientId },
      {
        $set: {
          allergies: currentDoc.allergies,
          conditions: currentDoc.conditions,
          dietaryPreferences: currentDoc.dietaryPreferences,
          ...(caller.orgId ? { orgId: caller.orgId } : {}),
          updatedAt: now,
          updatedBy: actor,
        },
        $setOnInsert: {
          createdAt: currentDoc.createdAt,
          createdBy: currentDoc.createdBy,
          patientId,
        },
      },
      { upsert: true },
    );

    return ok({
      eventsWritten: events.length,
      formValues: parsed.data,
      updatedAt: now,
    }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
