"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import type { PortalPatientMedicationData } from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalMedicationResponse = {
  data: PortalPatientMedicationData;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function PortalPatientMedicationPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalSession();
  const [data, setData] = useState<PortalPatientMedicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadMedicationProfile() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/medication`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalMedicationResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load medication profile",
          );
        }

        setData(body.data);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load medication profile",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadMedicationProfile();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>
        Loading medication profile...
      </section>
    );
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Medication profile unavailable</h2>
        <p>
          {error ?? "The requested medication profile could not be loaded."}
        </p>
      </section>
    );
  }

  const patientHref = data.patient?.id
    ? `/portal/patients/${data.patient.id}`
    : params.patientId
      ? `/portal/patients/${params.patientId}`
      : "/portal";

  return (
    <section className={styles.subpageLayout}>
      <PortalPatientSubpageHeader
        backHref={patientHref}
        backLabel="Back to patient"
        headline={data.headline}
      />

      {data && (
        <div>
          <article className={styles.detailCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.dataScreenTitle}>Medication summary</h3>
            </div>
            <div className={styles.cardBody}>
              <dl className={styles.detailFacts}>
                <div>
                  <dt>Active</dt>
                  <dd>{data?.summary?.activeCount}</dd>
                </div>
                <div>
                  <dt>Total shown</dt>
                  <dd>{data?.summary?.totalCount}</dd>
                </div>
                <div>
                  <dt>Projected records</dt>
                  <dd>{data?.summary?.projectedCount}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(data?.summary?.lastUpdatedAt)}</dd>
                </div>
              </dl>
            </div>
          </article>
        </div>
      )}

      <section className={styles.dataScreenCard}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h2 className={styles.dataScreenTitle}>Current medications</h2>
            <p className={styles.dataScreenCaption}>
              Active and historical medication states for this patient.
            </p>
          </div>
        </div>
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Dose</th>
                <th>Frequency</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Reason / instructions</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows?.length ? (
                data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className={styles.tableSubtleText}>
                        {row.source === "current_projection"
                          ? "Projected current record"
                          : "Clinical profile seed"}
                      </div>
                    </td>
                    <td>{row.dose ?? "Not set"}</td>
                    <td>{row.frequency ?? "Not set"}</td>
                    <td>{row.status}</td>
                    <td>{formatDate(row.startAt)}</td>
                    <td>{formatDate(row.endAt)}</td>
                    <td>
                      <div>
                        {row.latestReason ?? row.instructions ?? "No detail"}
                      </div>
                      {(row.route || row.form) && (
                        <div className={styles.tableSubtleText}>
                          {[row.route, row.form].filter(Boolean).join(" • ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    No current medication records were found for this patient.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.dataScreenCard}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h2 className={styles.dataScreenTitle}>
              Recent medication changes
            </h2>
            <p className={styles.dataScreenCaption}>
              Most recent ledger activity for this patient&apos;s medications.
            </p>
          </div>
        </div>
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>When</th>
                <th>Change</th>
                <th>By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentEvents?.length > 0 ? (
                data.recentEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.at)}</td>
                    <td>{event.label}</td>
                    <td>{event.by}</td>
                    <td>{event.reason ?? "No reason recorded"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No medication event history recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
