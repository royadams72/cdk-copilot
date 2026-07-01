"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
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

function toInputValue(value: number | null | undefined) {
  return typeof value === "number" ? String(value) : "";
}

function parseNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDefinition(definition: TargetDefinitionValue, unit: string) {
  if (definition.type === "range") {
    return `${definition.low ?? "?"} to ${definition.high ?? "?"} ${unit}`;
  }
  const value =
    definition.value ?? definition.high ?? definition.low ?? null;
  return `${value ?? "?"} ${unit}`;
}

export default function PortalPatientTargetsPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalSession();
  const [data, setData] = useState<TargetsResponse["data"] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [savingMetric, setSavingMetric] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) return;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/targets`,
          {
            headers: getPortalSessionAuthHeaders(session!.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | TargetsResponse
          | { error?: { message?: string } }
          | null;
        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load patient targets",
          );
        }
        setData(body.data);
        setDrafts(
          Object.fromEntries(
            body.data.items.map((item) => [
              item.metric,
              {
                high: toInputValue(item.state.override?.high ?? item.state.effective.high),
                low: toInputValue(item.state.override?.low ?? item.state.effective.low),
                reason: item.state.overrideMeta?.reason ?? "",
                value: toInputValue(item.state.override?.value ?? item.state.effective.value),
              },
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
  }, [params.patientId, session, status]);

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
      high: parseNumberInput(draft.high),
      low: parseNumberInput(draft.low),
      type: item.state.effective.type,
      value: parseNumberInput(draft.value),
    };

    setSavingMetric(item.metric);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/targets`,
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
      const body = (await response.json().catch(() => null)) as
        | { data?: { updated?: boolean } }
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to update target",
        );
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
        `/api/portal/patients/${params.patientId}/targets`,
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
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "Unable to clear target override",
        );
      }
      setDrafts((current) => ({
        ...current,
        [item.metric]: {
          high: toInputValue(item.state.recommended.high),
          low: toInputValue(item.state.recommended.low),
          reason: "",
          value: toInputValue(item.state.recommended.value),
        },
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
      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>{title}</span>
        </div>
        <div className={styles.worseningModalList}>
          {items.map((item) => {
            const draft = drafts[item.metric];
            return (
              <div className={styles.worseningModalItem} key={item.metric}>
                <strong>{item.label}</strong>
                <span>
                  Recommended: {formatDefinition(item.state.recommended, item.state.unit)}
                </span>
                <span>
                  Current: {formatDefinition(item.state.effective, item.state.unit)}
                  {item.state.effective.basis === "perKgPerDay" ? " per kg/day" : ""}
                </span>
                <div className={styles.worseningModalList}>
                  <label>
                    <span className={styles.listHeaderMeta}>Value</span>
                    <input
                      className={styles.inputField}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.metric]: {
                            ...current[item.metric],
                            value: event.target.value,
                          },
                        }))
                      }
                      value={draft?.value ?? ""}
                    />
                  </label>
                  {item.state.effective.type === "range" ? (
                    <>
                      <label>
                        <span className={styles.listHeaderMeta}>Low</span>
                        <input
                          className={styles.inputField}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.metric]: {
                                ...current[item.metric],
                                low: event.target.value,
                              },
                            }))
                          }
                          value={draft?.low ?? ""}
                        />
                      </label>
                      <label>
                        <span className={styles.listHeaderMeta}>High</span>
                        <input
                          className={styles.inputField}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.metric]: {
                                ...current[item.metric],
                                high: event.target.value,
                              },
                            }))
                          }
                          value={draft?.high ?? ""}
                        />
                      </label>
                    </>
                  ) : null}
                  <label>
                    <span className={styles.listHeaderMeta}>Reason</span>
                    <input
                      className={styles.inputField}
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
                    disabled={savingMetric === item.metric || !item.state.override}
                    onClick={() => void clearMetric(item)}
                    type="button"
                  >
                    Clear override
                  </button>
                  <button
                    className={styles.buttonPrimarySmall}
                    disabled={savingMetric === item.metric}
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
      </section>
    );
  }

  if (status === "loading" || loading) {
    return <section className={styles.emptyState}>Loading patient targets...</section>;
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <h2>Unable to load patient targets</h2>
        <p>{error ?? "Unknown error"}</p>
      </section>
    );
  }

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${params.patientId}`}
        backLabel="Back to patient"
        headline={`${data.patient.name} targets`}
      />
      {message ? <section className={styles.metaStrip}>{message}</section> : null}
      {error ? (
        <section className={styles.emptyState}>
          <p>{error}</p>
        </section>
      ) : null}
      {renderItems("Lifestyle targets", groupedItems.lifestyle)}
      {renderItems("Renal targets", groupedItems.renal)}
    </section>
  );
}
