"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
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

type TargetsResponse = {
  data: {
    items: TargetItem[];
    patient: { id: string; name: string };
  };
};

type DraftState = {
  high: string;
  low: string;
  reason: string;
  value: string;
};

function isSleepDurationMetric(metric: string) {
  return metric === "sleep_duration_min_day";
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

function toInputValue(metric: string, value: number | null | undefined) {
  if (typeof value !== "number") return "";
  if (isSleepDurationMetric(metric)) {
    return formatNumber(value / 60);
  }
  return formatNumber(value);
}

function parseNumberInput(metric: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  if (isSleepDurationMetric(metric)) {
    return Math.round(numeric * 60);
  }
  return numeric;
}

function sanitizeNumericInput(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "");
  const firstDecimalIndex = normalized.indexOf(".");
  if (firstDecimalIndex === -1) {
    return normalized;
  }

  const integerPart = normalized.slice(0, firstDecimalIndex + 1);
  const decimalPart = normalized
    .slice(firstDecimalIndex + 1)
    .replace(/\./g, "");
  return `${integerPart}${decimalPart}`;
}

function formatUnit(
  metric: string,
  definition: TargetDefinitionValue,
  unit: string,
) {
  if (isSleepDurationMetric(metric)) {
    return "hours/day";
  }

  if (definition.basis === "perKgPerDay") {
    return unit.replace("/day", "/kg/day");
  }

  return unit;
}

function formatDefinition(
  metric: string,
  definition: TargetDefinitionValue,
  unit: string,
) {
  const displayUnit = formatUnit(metric, definition, unit);
  const toDisplay = (value: number | null | undefined) =>
    typeof value === "number"
      ? isSleepDurationMetric(metric)
        ? formatNumber(value / 60)
        : formatNumber(value)
      : "?";

  if (definition.type === "range") {
    return `${toDisplay(definition.low)} to ${toDisplay(definition.high)} ${displayUnit}`;
  }
  const value = definition.value ?? definition.high ?? definition.low ?? null;
  return `${toDisplay(value)} ${displayUnit}`;
}

function buildDraftState(
  item: TargetItem,
  source: TargetDefinitionValue | null,
  reason: string | null | undefined,
): DraftState {
  return {
    high: toInputValue(item.metric, source?.high ?? null),
    low: toInputValue(item.metric, source?.low ?? null),
    reason: reason ?? "",
    value: toInputValue(item.metric, source?.value ?? null),
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

export default function PortalPatientTargetsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params["patientId"];
  const { session, status } = usePortalAuthSession();
  const [data, setData] = useState<TargetsResponse["data"] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [savingMetric, setSavingMetric] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !patientId) return;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/portal/patients/${patientId}/targets`,
          {
            headers: getPortalSessionAuthHeaders(session!.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response
          .json()
          .catch(() => null)) as TargetsResponse | null;
        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            readResponseMessage(body, "Unable to load patient targets"),
          );
        }
        setData(body.data);
        setDrafts(
          Object.fromEntries(
            body.data.items.map((item) => [
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
            : "Unable to load patient targets",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [patientId, session, status]);

  const groupedItems = useMemo(() => {
    const items = data?.items ?? [];
    return {
      lifestyle: items.filter((item) => item.domain === "lifestyle"),
      renal: items.filter((item) => item.domain === "renal"),
    };
  }, [data]);

  async function saveMetric(item: TargetItem) {
    if (!session) return;
    const draft = drafts[item.metric];
    if (!draft) return;

    const override: TargetDefinitionValue = {
      basis: item.state.effective.basis ?? null,
      high: parseNumberInput(item.metric, draft.high),
      low: parseNumberInput(item.metric, draft.low),
      type: item.state.effective.type,
      value:
        item.state.effective.type === "range"
          ? null
          : parseNumberInput(item.metric, draft.value),
    };

    setSavingMetric(item.metric);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${patientId}/targets`,
        {
          body: JSON.stringify({
            metric: item.metric,
            override,
            reason: draft.reason.trim() || undefined,
          }),
          headers: {
            ...getPortalSessionAuthHeaders(session!.jwt),
            "content-type": "application/json",
          },
          method: "PATCH",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { updated?: boolean };
      } | null;
      if (!response.ok) {
        throw new Error(readResponseMessage(body, "Unable to update target"));
      }

      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((currentItem) =>
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
        nextError instanceof Error
          ? nextError.message
          : "Unable to update target",
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
      const response = await fetch(
        `/api/portal/patients/${patientId}/targets`,
        {
          body: JSON.stringify({
            clearOverride: true,
            metric: item.metric,
          }),
          headers: {
            ...getPortalSessionAuthHeaders(session!.jwt),
            "content-type": "application/json",
          },
          method: "PATCH",
        },
      );
      const body = (await response.json().catch(() => null)) as null;
      if (!response.ok) {
        throw new Error(
          readResponseMessage(body, "Unable to clear target override"),
        );
      }
      setDrafts((current) => ({
        ...current,
        [item.metric]: buildDraftState(item, item.state.recommended, ""),
      }));
      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((currentItem) =>
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

  function renderItems(title: string, items: TargetItem[]) {
    return (
      <div className={styles.carePlanFormGroup}>
        <label className={styles.carePlanFieldLabel}>{title}</label>
        <div className={styles.portalFormSectionList}>
          {items.map((item) => {
            const draft = drafts[item.metric];
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
                  Recommended:{" "}
                  {formatDefinition(
                    item.metric,
                    item.state.recommended,
                    item.state.unit,
                  )}
                </span>
                <span>
                  Current:{" "}
                  {formatDefinition(
                    item.metric,
                    item.state.effective,
                    item.state.unit,
                  )}
                </span>
                <div className={styles.carePlanFormGroup}>
                  {item.state.effective.type !== "range" ? (
                    <label>
                      <span className={styles.dataScreenCaption}>Value</span>
                      <input
                        className={styles.carePlanInput}
                        onChange={(event) =>
                          setDrafts((current) => ({
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
                            setDrafts((current) => ({
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
                            setDrafts((current) => ({
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
                        setDrafts((current) => ({
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
                    disabled={
                      savingMetric === item.metric || !item.state.override
                    }
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
    );
  }

  if (status === "loading" || loading) {
    return <PortalLoadingState label="Loading renal targets..." />;
  }

  if (!data) {
    return (
      <section className={styles.emptyState}>
        <h2>Unable to load renal targets</h2>
        <p>{error ?? "Unknown error"}</p>
      </section>
    );
  }

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${patientId}`}
        backLabel="Back to patient"
        headline={`${data.patient.name} renal targets`}
      />
      {message ? (
        <section className={styles.metaStrip}>{message}</section>
      ) : null}
      {error ? (
        <section className={styles.emptyState}>
          <p>{error}</p>
        </section>
      ) : null}
      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Renal targets</h2>
        <p className={styles.carePlanFormLead}>
          Review the daily monitoring targets and set clinician overrides where
          needed. Nutrition targets are managed in the renal nutrition profile.
        </p>
      </div>
      <section className={styles.formShell}>
        {renderItems("Daily monitoring targets", groupedItems.lifestyle)}
      </section>
    </section>
  );
}
