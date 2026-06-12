"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import type { PortalPatientDetail } from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalPatientDetailResponse = {
  data: {
    dashboard: {
      actionCards: string[];
      clinicalSummary: Array<{ label: string; value: string }>;
      engagementSummary: Array<{ label: string; value: string }>;
      headline: string;
    };
    patient: PortalPatientDetail;
  };
};

export default function PortalPatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalSession();
  const [patient, setPatient] = useState<PortalPatientDetail | null>(null);
  const [dashboard, setDashboard] = useState<
    PortalPatientDetailResponse["data"]["dashboard"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadPatient() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalPatientDetailResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load patient record",
          );
        }

        setDashboard(body.data.dashboard);
        setPatient(body.data.patient);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load patient record",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadPatient();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>
        Loading patient dashboard...
      </section>
    );
  }

  if (!patient || error) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Patient record unavailable</h2>
        <p>{error ?? "The requested patient could not be loaded."}</p>
      </section>
    );
  }

  return (
    <section className={styles.detailLayout}>
      <div className={styles.patientHeadlineContainer}>
        <Link className={styles.patientBackLink} href="/portal">
          &larr; Back to patient list
        </Link>
        <div className={styles.patientHeadline}>
          <span aria-hidden="true" className={styles.patientHeadlineIcon}>
            <span className={styles.patientHeadlineAvatarHead} />
            <span className={styles.patientHeadlineAvatarBody} />
          </span>
          <div className={styles.patientHeadlineContent}>
            <div className={styles.patientHeadlineRow}>
              <div className={styles.patientHeadlineText}>
                {dashboard?.headline ?? `Viewing ${patient.name}`}
              </div>
            </div>
          </div>
        </div>
        <span aria-hidden="true" className={styles.patientBackLinkSpacer}>
          Back to patient list
        </span>
      </div>

      <div className={styles.patientSummaryGrid}>
        <article className={styles.patientSummaryPanel}>
          {dashboard?.clinicalSummary.map((row) => (
            <div className={styles.patientSummaryRow} key={row.label}>
              <span>{row.label}:</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </article>

        <article className={styles.patientSummaryPanel}>
          {dashboard?.engagementSummary.map((row) => (
            <div className={styles.patientSummaryRow} key={row.label}>
              <span>{row.label}:</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </article>
      </div>

      <div className={styles.patientActionGrid}>
        {dashboard?.actionCards.map((label) => (
          <button
            className={styles.patientActionButton}
            key={label}
            onClick={() => window.alert(`${label} is the next portal slice.`)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
