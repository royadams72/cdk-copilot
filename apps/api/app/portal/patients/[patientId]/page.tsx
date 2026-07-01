"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import type {
  PortalPatientCarePlanSnapshot,
  PortalPatientDashboardData,
  PortalPatientDetail,
  PortalPatientDetailResponse,
  PortalPatientOverviewRow,
} from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import PatientActionComponent from "../components/PatientActionComponent";
import PatientHeadlineContainer from "../components/PatientHeadlineContainer";
import PatientOverviewPanel from "../components/PatientOverviewPanel";

function renderOverviewValue(row: PortalPatientOverviewRow) {
  return row.href ? (
    <Link className={styles.patientPanelLink} href={row.href} prefetch={false}>
      {row.value}
    </Link>
  ) : (
    <strong>{row.value}</strong>
  );
}

function renderOverviewRows(rows: PortalPatientOverviewRow[]) {
  return rows.map((row) => (
    <div className={styles.patientSummaryRow} key={row.label}>
      <span>
        {row.label}
        {row.meta ? (
          <small className={styles.patientSummaryMeta}>{row.meta}</small>
        ) : null}
      </span>
      {renderOverviewValue(row)}
    </div>
  ));
}

function renderCarePlanSnapshot(snapshot: PortalPatientCarePlanSnapshot) {
  if (!snapshot) {
    return (
      <div className={styles.patientPanelEmpty}>
        No care plans recorded yet.
      </div>
    );
  }

  const reviewValue = formatDisplayDate(snapshot.nextReviewAt, {
    fallback: snapshot.reviewLabel
      ? `Review cadence ${snapshot.reviewLabel}`
      : "Not set",
  });

  const rows = [
    { label: "Latest plan", value: snapshot.title },
    { label: "Status", value: snapshot.status },
    { label: "Open tasks", value: snapshot.openTasksLabel },
    { label: "Next review", value: reviewValue },
  ];

  return rows.map((row) => (
    <div className={styles.patientSummaryRow} key={row.label}>
      <span>{row.label}</span>
      {snapshot.href ? (
        <Link
          className={styles.patientPanelLink}
          href={snapshot.href}
          prefetch={false}
        >
          {row.value}
        </Link>
      ) : (
        <strong>{row.value}</strong>
      )}
    </div>
  ));
}

export default function PortalPatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [patient, setPatient] = useState<PortalPatientDetail | null>(null);
  const [dashboard, setDashboard] = useState<PortalPatientDashboardData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const jwt = session?.jwt;

  useEffect(() => {
    if (status !== "authenticated" || !jwt || !params.patientId) {
      return;
    }

    const jwtForRequest = jwt;
    const controller = new AbortController();

    async function loadPatient() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}`,
          {
            headers: getPortalSessionAuthHeaders(jwtForRequest),
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

    void loadPatient();
    return () => controller.abort();
  }, [params.patientId, jwt, status]);

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
      <PatientHeadlineContainer
        backHref="/portal"
        backLabel="Back to patient list"
        headline={dashboard?.headline ?? `Viewing ${patient.name}`}
        subheadline={dashboard?.subheadline}
      />

      <PatientActionComponent dashboard={dashboard} patientId={patient.id} />

      <div className={styles.patientOverviewGrid}>
        <PatientOverviewPanel title="Current status">
          {renderOverviewRows(dashboard?.currentStatus ?? [])}
        </PatientOverviewPanel>

        <PatientOverviewPanel title="Latest readings">
          {renderOverviewRows(dashboard?.latestReadings ?? [])}
        </PatientOverviewPanel>

        <PatientOverviewPanel title="Care plan snapshot">
          {renderCarePlanSnapshot(dashboard?.carePlanSnapshot ?? null)}
        </PatientOverviewPanel>

        <PatientOverviewPanel id="attention-needed" title="Attention needed">
          <div className={styles.patientAttentionList}>
            {(dashboard?.attentionItems ?? []).map((item) => (
              <div
                className={styles.patientAttentionItem}
                data-tone={item.tone}
                key={`${item.title}-${item.detail}`}
              >
                {item.href ? (
                  <>
                    <Link
                      className={styles.patientPanelLink}
                      href={item.href}
                      prefetch={false}
                    >
                      {item.title}
                    </Link>
                    <Link
                      className={styles.patientAttentionLink}
                      href={item.href}
                      prefetch={false}
                    >
                      {item.detail}
                    </Link>
                  </>
                ) : (
                  <>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </PatientOverviewPanel>
      </div>

      <div className={styles.patientSummaryGrid}>
        <article className={styles.patientSummaryPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>
              31-day clinical trends
            </h3>
          </div>
          {(dashboard?.clinicalSummary ?? []).map((row) => (
            <div className={styles.patientSummaryRow} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </article>

        <article className={styles.patientSummaryPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>31-day engagement</h3>
          </div>
          {(dashboard?.engagementSummary ?? []).map((row) => (
            <div className={styles.patientSummaryRow} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </article>
      </div>

      <PatientOverviewPanel title="Recent activity">
        {(dashboard?.recentActivity ?? []).length ? (
          <div className={styles.patientActivityList}>
            {dashboard?.recentActivity.map((item) => (
              <div className={styles.patientActivityRow} key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  {item.detail ? (
                    <p className={styles.patientActivityDetail}>
                      {item.detail}
                    </p>
                  ) : null}
                </div>
                <span className={styles.patientActivityAt}>
                  {formatDisplayDate(item.at, { includeTime: true })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.patientPanelEmpty}>
            No recent activity to show.
          </div>
        )}
      </PatientOverviewPanel>
    </section>
  );
}
