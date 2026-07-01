"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type DiagnosisItem = {
  code: string;
  codeSystem: string;
  entryId: string;
  label: string;
  notes: string | null;
  status: string;
};

type DiagnosisResponse = {
  data: {
    items: DiagnosisItem[];
    patient: { id: string; name: string };
  };
};

type SearchResult = {
  code: string;
  label: string;
};

export default function PortalPatientDiagnosesPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [data, setData] = useState<DiagnosisResponse["data"] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
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
          `/api/portal/patients/${params.patientId}/diagnoses`,
          {
            headers: getPortalSessionAuthHeaders(session!.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | DiagnosisResponse
          | { error?: { message?: string } }
          | null;
        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load diagnoses",
          );
        }
        setData(body.data);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load diagnoses",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  useEffect(() => {
    if (!session || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setError(null);

    async function search() {
      try {
        const response = await fetch(
          `/api/terminology/conditions/search?query=${encodeURIComponent(query.trim())}&limit=8`,
          {
            headers: getPortalSessionAuthHeaders(session!.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { data?: { items?: Array<{ code: string; label: string }> } }
          | { error?: { message?: string } }
          | null;
        if (!response.ok) {
          throw new Error(body && "error" in body ? body.error?.message : "Unable to search conditions");
        }
        setResults(body && "data" in body ? body.data?.items ?? [] : []);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to search conditions",
        );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }

    void search();
    return () => controller.abort();
  }, [query, session]);

  async function addDiagnosis(input: {
    code?: string;
    codeSystem?: string;
    label: string;
  }) {
    if (!session) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/diagnoses`,
        {
          body: JSON.stringify(input),
          headers: {
            ...getPortalSessionAuthHeaders(session!.jwt),
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { data?: { added?: boolean; item?: DiagnosisItem } }
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body && "error" in body ? body.error?.message : "Unable to add diagnosis");
      }
      await reload();
      setMessage(`Added ${input.label}.`);
      setQuery("");
      setResults([]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to add diagnosis",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeDiagnosis(entryId: string, label: string) {
    if (!session) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/diagnoses`,
        {
          body: JSON.stringify({ entryId }),
          headers: {
            ...getPortalSessionAuthHeaders(session!.jwt),
            "content-type": "application/json",
          },
          method: "DELETE",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Unable to remove diagnosis");
      }
      await reload();
      setMessage(`Removed ${label}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to remove diagnosis",
      );
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    if (!session) return;
    const response = await fetch(`/api/portal/patients/${params.patientId}/diagnoses`, {
      headers: getPortalSessionAuthHeaders(session!.jwt),
    });
    const body = (await response.json().catch(() => null)) as DiagnosisResponse | null;
    if (response.ok && body && "data" in body) {
      setData(body.data);
    }
  }

  if (status === "loading" || loading) {
    return <section className={styles.emptyState}>Loading diagnoses...</section>;
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <h2>Unable to load diagnoses</h2>
        <p>{error ?? "Unknown error"}</p>
      </section>
    );
  }

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${params.patientId}`}
        backLabel="Back to patient"
        headline={`${data.patient.name} diagnoses`}
      />
      {message ? <section className={styles.metaStrip}>{message}</section> : null}
      {error ? (
        <section className={styles.emptyState}>
          <p>{error}</p>
        </section>
      ) : null}
      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Add diagnosis</span>
        </div>
        <div className={styles.worseningModalList}>
          <label>
            <span className={styles.listHeaderMeta}>Search SNOMED or enter custom diagnosis</span>
            <input
              className={styles.inputField}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Start typing a diagnosis"
              value={query}
            />
          </label>
          {searching ? <div className={styles.metaStrip}>Searching conditions...</div> : null}
          {results.length ? (
            <div className={styles.worseningModalList}>
              {results.map((result) => (
                <button
                  className={styles.patientActionInlineButton}
                  key={result.code}
                  onClick={() =>
                    void addDiagnosis({
                      code: result.code,
                      codeSystem: "SNOMED_CT",
                      label: result.label,
                    })
                  }
                  type="button"
                >
                  {result.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.warningActions}>
            <button
              className={styles.buttonPrimarySmall}
              disabled={saving || query.trim().length < 2}
              onClick={() => void addDiagnosis({ label: query.trim() })}
              type="button"
            >
              Add custom diagnosis
            </button>
          </div>
        </div>
      </section>
      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Current diagnoses</span>
        </div>
        {!data.items.length ? (
          <div className={styles.emptyState}>No diagnoses recorded yet.</div>
        ) : (
          <div className={styles.worseningModalList}>
            {data.items.map((item) => (
              <div className={styles.worseningModalItem} key={item.entryId}>
                <strong>{item.label}</strong>
                <span>
                  {item.codeSystem}
                  {item.code ? ` · ${item.code}` : ""}
                </span>
                {item.notes ? <span>{item.notes}</span> : null}
                <div className={styles.warningActions}>
                  <button
                    className={styles.buttonSecondarySmall}
                    disabled={saving}
                    onClick={() => void removeDiagnosis(item.entryId, item.label)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
