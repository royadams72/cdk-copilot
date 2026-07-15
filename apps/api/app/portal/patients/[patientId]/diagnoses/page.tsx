"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { readResponseMessage } from "@/apps/api/lib/http/response-message";
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
  const patientId = params["patientId"];
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
    if (status !== "authenticated" || !session || !patientId) return;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/portal/patients/${patientId}/diagnoses`,
          {
            headers: getPortalSessionAuthHeaders(session!.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response
          .json()
          .catch(() => null)) as DiagnosisResponse | null;
        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            readResponseMessage(body, "Unable to load diagnoses"),
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
  }, [patientId, session, status]);

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
        const body = (await response.json().catch(() => null)) as {
          data?: { items?: Array<{ code: string; label: string }> };
        } | null;
        if (!response.ok) {
          throw new Error(
            readResponseMessage(body, "Unable to search conditions"),
          );
        }
        setResults(body && "data" in body ? (body.data?.items ?? []) : []);
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
        `/api/portal/patients/${patientId}/diagnoses`,
        {
          body: JSON.stringify(input),
          headers: {
            ...getPortalSessionAuthHeaders(session!.jwt),
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { added?: boolean; item?: DiagnosisItem };
      } | null;
      if (!response.ok) {
        throw new Error(readResponseMessage(body, "Unable to add diagnosis"));
      }
      await reload();
      setMessage(`Added ${input.label}.`);
      setQuery("");
      setResults([]);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to add diagnosis",
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
        `/api/portal/patients/${patientId}/diagnoses`,
        {
          body: JSON.stringify({ entryId }),
          headers: {
            ...getPortalSessionAuthHeaders(session!.jwt),
            "content-type": "application/json",
          },
          method: "DELETE",
        },
      );
      const body = (await response.json().catch(() => null)) as null;
      if (!response.ok) {
        throw new Error(
          readResponseMessage(body, "Unable to remove diagnosis"),
        );
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

  function addCustomDiagnosis() {
    const label = query.trim();
    if (label.length < 2) {
      return;
    }

    void addDiagnosis({ label });
  }

  async function reload() {
    if (!session) return;
    const response = await fetch(
      `/api/portal/patients/${patientId}/diagnoses`,
      {
        headers: getPortalSessionAuthHeaders(session!.jwt),
      },
    );
    const body = (await response
      .json()
      .catch(() => null)) as DiagnosisResponse | null;
    if (response.ok && body && "data" in body) {
      setData(body.data);
    }
  }

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>Loading diagnoses...</section>
    );
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
        backHref={`/portal/patients/${patientId}`}
        backLabel="Back to patient"
        headline={`${data.patient.name} diagnoses`}
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
        <h2 className={styles.carePlanFormTitle}>Diagnoses</h2>
        <p className={styles.carePlanFormLead}>
          Add or remove diagnoses already recorded for this patient.
        </p>
      </div>
      <section className={styles.formShell}>
        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>Add diagnosis</label>
          <p className={styles.dataScreenCaption}>
            Search SNOMED and add a result, or enter a custom diagnosis.
          </p>
          <input
            className={styles.carePlanInput}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addCustomDiagnosis();
            }}
            placeholder="Search condition or enter custom diagnosis"
            value={query}
          />
          <p className={styles.dataScreenCaption}>
            Select a search result to add it, or press Enter to save custom
            text.
          </p>
          {searching ? (
            <p className={styles.dataScreenCaption}>Searching conditions...</p>
          ) : null}
          {results.length ? (
            <div className={styles.carePlanSearchResults}>
              {results.map((result) => (
                <button
                  className={styles.carePlanSearchResult}
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
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>Current diagnoses</label>
          {!data.items.length ? (
            <div className={styles.emptyState}>No diagnoses recorded yet.</div>
          ) : (
            <div className={styles.portalFormSectionList}>
              {data.items.map((item) => (
                <div
                  className={styles.portalFormSectionItem}
                  key={item.entryId}
                >
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
                      onClick={() =>
                        void removeDiagnosis(item.entryId, item.label)
                      }
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
