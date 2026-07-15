"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  DIETARY_PREFERENCE_OPTIONS,
  ENVIRONMENTAL_ALLERGENS,
  FOOD_ALLERGENS,
  LATEX_ALLERGENS,
} from "@ckd/core";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { readResponseMessage } from "@/apps/api/lib/http/response-message";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type TargetDefinitionValue = {
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  type: "range" | "max" | "min" | "exact";
  value?: number | null;
};

type TargetItem = {
  domain: "renal" | "lifestyle";
  label: string;
  metric: string;
  state: {
    effective: TargetDefinitionValue;
    override: TargetDefinitionValue | null;
    overrideMeta: {
      reason?: string | null;
      setAt: string;
      setBy: { principalId: string };
    } | null;
    recommended: TargetDefinitionValue;
    unit: string;
  };
};

type NutritionProfileResponse = {
  data: {
    nutritionTargets: TargetItem[];
    patient: { id: string; name: string };
    profile: {
      allergyIntolerances: string[];
      dietaryRestrictions: string[];
      fluidLimitLitres: number | null;
      notesFromDietitian: string | null;
      renalDietGuidance: string | null;
      reviewDueDate: string | null;
    };
  };
};

type DraftState = {
  high: string;
  low: string;
  reason: string;
  value: string;
};

type ProfileDraft = {
  allergyIntolerances: string[];
  dietaryRestrictions: string[];
  fluidLimitLitres: string;
  notesFromDietitian: string;
  renalDietGuidance: string;
  reviewDueDate: string;
};

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatUnit(definition: TargetDefinitionValue, unit: string) {
  if (definition.basis === "perKgPerDay") {
    return unit.replace("/day", "/kg/day");
  }
  return unit;
}

function formatDefinition(definition: TargetDefinitionValue, unit: string) {
  const displayUnit = formatUnit(definition, unit);
  const toDisplay = (value: number | null | undefined) =>
    typeof value === "number" ? formatNumber(value) : "?";

  if (definition.type === "range") {
    return `${toDisplay(definition.low)} to ${toDisplay(definition.high)} ${displayUnit}`;
  }

  const value = definition.value ?? definition.high ?? definition.low ?? null;
  return `${toDisplay(value)} ${displayUnit}`;
}

function toInputValue(value: number | null | undefined) {
  if (typeof value !== "number") return "";
  return formatNumber(value);
}

function parseNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeNumericInput(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "");
  const firstDecimalIndex = normalized.indexOf(".");
  if (firstDecimalIndex === -1) {
    return normalized;
  }

  const integerPart = normalized.slice(0, firstDecimalIndex + 1);
  const decimalPart = normalized.slice(firstDecimalIndex + 1).replace(/\./g, "");
  return `${integerPart}${decimalPart}`;
}

function buildDraftState(
  item: TargetItem,
  source: TargetDefinitionValue | null,
  reason: string | null | undefined,
): DraftState {
  return {
    high: toInputValue(source?.high ?? null),
    low: toInputValue(source?.low ?? null),
    reason: reason ?? "",
    value: toInputValue(source?.value ?? null),
  };
}

function draftsMatch(left: DraftState | undefined, right: DraftState) {
  if (!left) return false;
  return (
    left.high.trim() === right.high.trim() &&
    left.low.trim() === right.low.trim() &&
    left.reason.trim() === right.reason.trim() &&
    left.value.trim() === right.value.trim()
  );
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function optionChildrenLabels(
  option:
    | { label: string }
    | { label: string; children: readonly { label: string }[] },
) {
  if (!("children" in option)) {
    return [];
  }
  return option.children.map((child) => child.label);
}

function flattenAllergyLabels() {
  const direct = [
    ...FOOD_ALLERGENS.map((option) => option.label),
    ...ENVIRONMENTAL_ALLERGENS.map((option) => option.label),
    ...LATEX_ALLERGENS.map((option) => option.label),
  ];
  const children = [
    ...FOOD_ALLERGENS.flatMap((option) => optionChildrenLabels(option)),
    ...ENVIRONMENTAL_ALLERGENS.flatMap((option) =>
      optionChildrenLabels(option),
    ),
  ];

  return dedupeStrings([...direct, ...children]).sort((left, right) =>
    left.localeCompare(right),
  );
}

const DIETARY_RESTRICTION_LABELS = dedupeStrings(
  DIETARY_PREFERENCE_OPTIONS.map((option) => option.label),
).sort((left, right) => left.localeCompare(right));

const ALLERGY_LABELS = flattenAllergyLabels();

function filterSuggestions(options: string[], query: string, selected: string[]) {
  const normalizedQuery = query.trim().toLowerCase();
  return options.filter((option) => {
    if (selected.includes(option)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return option.toLowerCase().includes(normalizedQuery);
  });
}

function addSelectedValue(values: string[], nextValue: string) {
  return dedupeStrings([...values, nextValue]);
}

function removeSelectedValue(values: string[], value: string) {
  return values.filter((item) => item !== value);
}

export default function PortalPatientNutritionProfilePage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params["patientId"];
  const { session, status } = usePortalAuthSession();
  const [data, setData] = useState<NutritionProfileResponse["data"] | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [savingMetric, setSavingMetric] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dietaryRestrictionQuery, setDietaryRestrictionQuery] = useState("");
  const [allergyQuery, setAllergyQuery] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !session || !patientId) return;

    const authenticatedSession = session;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/portal/patients/${patientId}/nutrition-profile`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | NutritionProfileResponse
          | null;
        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            readResponseMessage(body, "Unable to load renal nutrition profile"),
          );
        }

        setData(body.data);
        setProfileDraft({
          allergyIntolerances: body.data.profile.allergyIntolerances,
          dietaryRestrictions: body.data.profile.dietaryRestrictions,
          fluidLimitLitres: toInputValue(body.data.profile.fluidLimitLitres),
          notesFromDietitian: body.data.profile.notesFromDietitian ?? "",
          renalDietGuidance: body.data.profile.renalDietGuidance ?? "",
          reviewDueDate: body.data.profile.reviewDueDate ?? "",
        });
        setTargetDrafts(
          Object.fromEntries(
            body.data.nutritionTargets.map((item) => [
              item.metric,
              buildDraftState(
                item,
                item.state.override ?? item.state.effective,
                item.state.overrideMeta?.reason,
              ),
            ]),
          ),
        );
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load renal nutrition profile",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [patientId, session, status]);

  const profileChanged = useMemo(() => {
    if (!data || !profileDraft) return false;
    return (
      JSON.stringify(profileDraft.allergyIntolerances) !==
        JSON.stringify(data.profile.allergyIntolerances) ||
      JSON.stringify(profileDraft.dietaryRestrictions) !==
        JSON.stringify(data.profile.dietaryRestrictions) ||
      profileDraft.fluidLimitLitres.trim() !==
        toInputValue(data.profile.fluidLimitLitres).trim() ||
      profileDraft.notesFromDietitian.trim() !==
        (data.profile.notesFromDietitian ?? "").trim() ||
      profileDraft.renalDietGuidance.trim() !==
        (data.profile.renalDietGuidance ?? "").trim() ||
      profileDraft.reviewDueDate.trim() !== (data.profile.reviewDueDate ?? "").trim()
    );
  }, [data, profileDraft]);

  async function saveProfile() {
    if (!session || !profileDraft) return;

    setSavingProfile(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${patientId}/nutrition-profile`,
        {
          body: JSON.stringify({
            allergyIntolerances: profileDraft.allergyIntolerances,
            dietaryRestrictions: profileDraft.dietaryRestrictions,
            fluidLimitLitres: parseNumberInput(profileDraft.fluidLimitLitres),
            notesFromDietitian: profileDraft.notesFromDietitian.trim() || null,
            renalDietGuidance: profileDraft.renalDietGuidance.trim() || null,
            reviewDueDate: profileDraft.reviewDueDate.trim() || null,
          }),
          headers: {
            ...getPortalSessionAuthHeaders(session.jwt),
            "content-type": "application/json",
          },
          method: "PATCH",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { data?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(
          readResponseMessage(body, "Unable to update renal nutrition profile"),
        );
      }

      setData((current) =>
        current
          ? {
              ...current,
              profile: {
                allergyIntolerances: profileDraft.allergyIntolerances,
                dietaryRestrictions: profileDraft.dietaryRestrictions,
                fluidLimitLitres: parseNumberInput(profileDraft.fluidLimitLitres),
                notesFromDietitian: profileDraft.notesFromDietitian.trim() || null,
                renalDietGuidance: profileDraft.renalDietGuidance.trim() || null,
                reviewDueDate: profileDraft.reviewDueDate.trim() || null,
              },
            }
          : current,
      );
      setMessage("Updated renal nutrition profile.");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update renal nutrition profile",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveMetric(item: TargetItem) {
    if (!session) return;
    const draft = targetDrafts[item.metric];
    if (!draft) return;

    const override: TargetDefinitionValue = {
      basis: item.state.effective.basis ?? null,
      high: draft.high.trim() ? parseNumberInput(draft.high) : null,
      low: draft.low.trim() ? parseNumberInput(draft.low) : null,
      type: item.state.effective.type,
      value:
        item.state.effective.type === "range"
          ? null
          : parseNumberInput(draft.value),
    };

    setSavingMetric(item.metric);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/portal/patients/${patientId}/targets`, {
        body: JSON.stringify({
          metric: item.metric,
          override,
          reason: draft.reason.trim() || undefined,
        }),
        headers: {
          ...getPortalSessionAuthHeaders(session.jwt),
          "content-type": "application/json",
        },
        method: "PATCH",
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: { updated?: boolean } }
        | null;
      if (!response.ok) {
        throw new Error(readResponseMessage(body, "Unable to update target"));
      }

      setData((current) =>
        current
          ? {
              ...current,
              nutritionTargets: current.nutritionTargets.map((currentItem) =>
                currentItem.metric === item.metric
                  ? {
                      ...currentItem,
                      state: {
                        ...currentItem.state,
                        effective: override,
                        override,
                        overrideMeta: {
                          reason: draft.reason.trim() || null,
                          setAt: new Date().toISOString(),
                          setBy: { principalId: "portal-clinician" },
                        },
                      },
                    }
                  : currentItem,
              ),
            }
          : current,
      );
      setMessage(`Updated ${item.label}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to update target",
      );
    } finally {
      setSavingMetric(null);
    }
  }

  async function clearMetric(item: TargetItem) {
    if (!session) return;
    setSavingMetric(item.metric);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/portal/patients/${patientId}/targets`, {
        body: JSON.stringify({
          clearOverride: true,
          metric: item.metric,
        }),
        headers: {
          ...getPortalSessionAuthHeaders(session.jwt),
          "content-type": "application/json",
        },
        method: "PATCH",
      });
      const body = (await response.json().catch(() => null)) as null;
      if (!response.ok) {
        throw new Error(readResponseMessage(body, "Unable to clear target override"));
      }

      setTargetDrafts((current) => ({
        ...current,
        [item.metric]: buildDraftState(item, item.state.recommended, ""),
      }));
      setData((current) =>
        current
          ? {
              ...current,
              nutritionTargets: current.nutritionTargets.map((currentItem) =>
                currentItem.metric === item.metric
                  ? {
                      ...currentItem,
                      state: {
                        ...currentItem.state,
                        effective: currentItem.state.recommended,
                        override: null,
                        overrideMeta: null,
                      },
                    }
                  : currentItem,
              ),
            }
          : current,
      );
      setMessage(`Cleared override for ${item.label}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to clear target override",
      );
    } finally {
      setSavingMetric(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>
        Loading renal nutrition profile...
      </section>
    );
  }

  if (!data || !profileDraft) {
    return (
      <section className={styles.emptyState}>
        <h2>Unable to load renal nutrition profile</h2>
        <p>{error ?? "Unknown error"}</p>
      </section>
    );
  }

  const dietaryRestrictionSuggestions = filterSuggestions(
    DIETARY_RESTRICTION_LABELS,
    dietaryRestrictionQuery,
    profileDraft.dietaryRestrictions,
  ).slice(0, 8);
  const allergySuggestions = filterSuggestions(
    ALLERGY_LABELS,
    allergyQuery,
    profileDraft.allergyIntolerances,
  ).slice(0, 8);

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${patientId}`}
        backLabel="Back to patient"
        headline={`${data.patient.name} renal nutrition profile`}
      />
      {message ? <section className={styles.metaStrip}>{message}</section> : null}
      {error ? (
        <section className={styles.emptyState}>
          <p>{error}</p>
        </section>
      ) : null}
      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Renal nutrition profile</h2>
        <p className={styles.carePlanFormLead}>
          Maintain the renal diet guidance, fluid limit, and nutrition target
          overrides in one place.
        </p>
      </div>
      <section className={styles.portalFormShellWide}>
        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>Profile details</label>
          <div className={styles.portalFormSectionList}>
            <div className={styles.portalFormSectionItem}>
              <label className={styles.carePlanFormGroup}>
                <span className={styles.dataScreenCaption}>
                  Dietary restrictions
                </span>
                <input
                  className={styles.carePlanInput}
                  onChange={(event) => setDietaryRestrictionQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const value = dietaryRestrictionQuery.trim();
                    if (!value) return;
                    event.preventDefault();
                    setProfileDraft((current) =>
                      current
                        ? {
                            ...current,
                            dietaryRestrictions: addSelectedValue(
                              current.dietaryRestrictions,
                              value,
                            ),
                          }
                        : current,
                    );
                    setDietaryRestrictionQuery("");
                  }}
                  placeholder="Search or enter restriction"
                  value={dietaryRestrictionQuery}
                />
                {dietaryRestrictionSuggestions.length ? (
                  <div className={styles.carePlanSearchResults}>
                    {dietaryRestrictionSuggestions.map((option) => (
                      <button
                        className={styles.carePlanSearchResult}
                        key={option}
                        onClick={() => {
                          setProfileDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  dietaryRestrictions: addSelectedValue(
                                    current.dietaryRestrictions,
                                    option,
                                  ),
                                }
                              : current,
                          );
                          setDietaryRestrictionQuery("");
                        }}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={styles.carePlanChipList}>
                  {profileDraft.dietaryRestrictions.map((item) => (
                    <button
                      className={styles.carePlanChip}
                      key={item}
                      onClick={() =>
                        setProfileDraft((current) =>
                          current
                            ? {
                                ...current,
                                dietaryRestrictions: removeSelectedValue(
                                  current.dietaryRestrictions,
                                  item,
                                ),
                              }
                            : current,
                        )
                      }
                      type="button"
                    >
                      {item} ×
                    </button>
                  ))}
                </div>
              </label>
              <label className={styles.carePlanFormGroup}>
                <span className={styles.dataScreenCaption}>
                  Allergies / intolerances
                </span>
                <input
                  className={styles.carePlanInput}
                  onChange={(event) => setAllergyQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const value = allergyQuery.trim();
                    if (!value) return;
                    event.preventDefault();
                    setProfileDraft((current) =>
                      current
                        ? {
                            ...current,
                            allergyIntolerances: addSelectedValue(
                              current.allergyIntolerances,
                              value,
                            ),
                          }
                        : current,
                    );
                    setAllergyQuery("");
                  }}
                  placeholder="Search or enter allergy / intolerance"
                  value={allergyQuery}
                />
                {allergySuggestions.length ? (
                  <div className={styles.carePlanSearchResults}>
                    {allergySuggestions.map((option) => (
                      <button
                        className={styles.carePlanSearchResult}
                        key={option}
                        onClick={() => {
                          setProfileDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  allergyIntolerances: addSelectedValue(
                                    current.allergyIntolerances,
                                    option,
                                  ),
                                }
                              : current,
                          );
                          setAllergyQuery("");
                        }}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={styles.carePlanChipList}>
                  {profileDraft.allergyIntolerances.map((item) => (
                    <button
                      className={styles.carePlanChip}
                      key={item}
                      onClick={() =>
                        setProfileDraft((current) =>
                          current
                            ? {
                                ...current,
                                allergyIntolerances: removeSelectedValue(
                                  current.allergyIntolerances,
                                  item,
                                ),
                              }
                            : current,
                        )
                      }
                      type="button"
                    >
                      {item} ×
                    </button>
                  ))}
                </div>
              </label>
              <label className={styles.carePlanFormGroup}>
                <span className={styles.dataScreenCaption}>
                  Renal diet guidance
                </span>
                <textarea
                  className={styles.carePlanTextarea}
                  onChange={(event) =>
                    setProfileDraft((current) =>
                      current
                        ? {
                            ...current,
                            renalDietGuidance: event.target.value,
                          }
                        : current,
                    )
                  }
                  rows={4}
                  value={profileDraft.renalDietGuidance}
                />
              </label>
              <div className={styles.portalFormGrid}>
                <label className={styles.carePlanFormGroup}>
                  <span className={styles.dataScreenCaption}>
                    Fluid limit (litres/day)
                  </span>
                  <input
                    className={styles.carePlanInput}
                    onChange={(event) =>
                      setProfileDraft((current) =>
                        current
                          ? {
                              ...current,
                              fluidLimitLitres: sanitizeNumericInput(
                                event.target.value,
                              ),
                            }
                          : current,
                      )
                    }
                    inputMode="decimal"
                    pattern="[0-9]*[.]?[0-9]*"
                    value={profileDraft.fluidLimitLitres}
                  />
                </label>
                <label className={styles.carePlanFormGroup}>
                  <span className={styles.dataScreenCaption}>Review due date</span>
                  <input
                    className={styles.carePlanInput}
                    onChange={(event) =>
                      setProfileDraft((current) =>
                        current
                          ? {
                              ...current,
                              reviewDueDate: event.target.value,
                            }
                          : current,
                      )
                    }
                    type="date"
                    value={profileDraft.reviewDueDate}
                  />
                </label>
              </div>
              <label className={styles.carePlanFormGroup}>
                <span className={styles.dataScreenCaption}>
                  Notes from dietitian
                </span>
                <textarea
                  className={styles.carePlanTextarea}
                  onChange={(event) =>
                    setProfileDraft((current) =>
                      current
                        ? {
                            ...current,
                            notesFromDietitian: event.target.value,
                          }
                        : current,
                    )
                  }
                  rows={4}
                  value={profileDraft.notesFromDietitian}
                />
              </label>
              <div className={styles.warningActions}>
                <button
                  className={styles.buttonPrimarySmall}
                  disabled={savingProfile || !profileChanged}
                  onClick={() => void saveProfile()}
                  type="button"
                >
                  {savingProfile ? "Saving..." : "Save profile"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>Nutrition targets</label>
          <div className={styles.portalFormSectionList}>
            {data.nutritionTargets.map((item) => {
              const draft = targetDrafts[item.metric];
              const persistedDraft = buildDraftState(
                item,
                item.state.override ?? item.state.effective,
                item.state.overrideMeta?.reason,
              );
              const hasDraftChanges = draftsMatch(draft, persistedDraft)
                ? false
                : Boolean(draft);

              return (
                <div className={styles.portalFormSectionItem} key={item.metric}>
                  <strong>{item.label}</strong>
                  <span>
                    Recommended: {formatDefinition(item.state.recommended, item.state.unit)}
                  </span>
                  <span>
                    Current: {formatDefinition(item.state.effective, item.state.unit)}
                  </span>
                  <div className={styles.carePlanFormGroup}>
                    {item.state.effective.type !== "range" ? (
                      <label>
                        <span className={styles.dataScreenCaption}>Value</span>
                        <input
                          className={styles.carePlanInput}
                          onChange={(event) =>
                            setTargetDrafts((current) => ({
                              ...current,
                              [item.metric]: {
                                ...current[item.metric],
                                value: sanitizeNumericInput(event.target.value),
                              },
                            }))
                          }
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]*"
                          value={draft?.value ?? ""}
                        />
                      </label>
                    ) : null}
                    {item.state.effective.type === "range" ? (
                      <div className={styles.carePlanInlineRow}>
                        <label>
                          <span className={styles.dataScreenCaption}>Low</span>
                          <input
                            className={styles.carePlanInput}
                            onChange={(event) =>
                              setTargetDrafts((current) => ({
                                ...current,
                                [item.metric]: {
                                  ...current[item.metric],
                                  low: sanitizeNumericInput(event.target.value),
                                },
                              }))
                            }
                            inputMode="decimal"
                            pattern="[0-9]*[.]?[0-9]*"
                            value={draft?.low ?? ""}
                          />
                        </label>
                        <label>
                          <span className={styles.dataScreenCaption}>High</span>
                          <input
                            className={styles.carePlanInput}
                            onChange={(event) =>
                              setTargetDrafts((current) => ({
                                ...current,
                                [item.metric]: {
                                  ...current[item.metric],
                                  high: sanitizeNumericInput(event.target.value),
                                },
                              }))
                            }
                            inputMode="decimal"
                            pattern="[0-9]*[.]?[0-9]*"
                            value={draft?.high ?? ""}
                          />
                        </label>
                      </div>
                    ) : null}
                    <label>
                      <span className={styles.dataScreenCaption}>Reason</span>
                      <input
                        className={styles.carePlanInput}
                        onChange={(event) =>
                          setTargetDrafts((current) => ({
                            ...current,
                            [item.metric]: {
                              ...current[item.metric],
                              reason: event.target.value,
                            },
                          }))
                        }
                        placeholder="Optional note"
                        value={draft?.reason ?? ""}
                      />
                    </label>
                  </div>
                  <div className={styles.warningActions}>
                    <button
                      className={styles.buttonSecondarySmall}
                      disabled={savingMetric === item.metric || !item.state.override}
                      onClick={() => void clearMetric(item)}
                      type="button"
                    >
                      Clear override
                    </button>
                    <button
                      className={styles.buttonPrimarySmall}
                      disabled={savingMetric === item.metric || !hasDraftChanges}
                      onClick={() => void saveMetric(item)}
                      type="button"
                    >
                      {savingMetric === item.metric ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </section>
  );
}
