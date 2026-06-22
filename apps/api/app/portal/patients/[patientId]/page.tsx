"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import type {
  PortalPatientDashboardData,
  PortalPatientDetail,
} from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalPatientDetailResponse = {
  data: {
    dashboard: PortalPatientDashboardData;
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

    loadPatient();
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

  function renderOverviewValue(row: { href?: string | null; value: string }) {
    return row.href ? (
      <Link className={styles.patientPanelLink} href={row.href} prefetch={false}>
        {row.value}
      </Link>
    ) : (
      <strong>{row.value}</strong>
    );
  }

  return (
    <section className={styles.detailLayout}>
      <div className={styles.patientHeadlineContainer}>
        <Link className={styles.patientBackLink} href="/portal" prefetch={false}>
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
            {dashboard?.subheadline ? (
              <p className={styles.patientHeadlineMeta}>{dashboard.subheadline}</p>
            ) : null}
          </div>
        </div>
        <span aria-hidden="true" className={styles.patientBackLinkSpacer}>
          Back to patient list
        </span>
      </div>

      <div className={styles.patientActionRow}>
        {dashboard?.actionCards.map((label) =>
          label === "Nutrition Data" ? (
            <Link
              className={styles.patientActionInlineLink}
              href={`/portal/patients/${patient.id}/nutrition`}
              key={label}
              prefetch={false}
            >
              {label}
            </Link>
          ) : label === "Health Data" ? (
            <Link
              className={styles.patientActionInlineLink}
              href={`/portal/patients/${patient.id}/health`}
              key={label}
              prefetch={false}
            >
              {label}
            </Link>
          ) : label === "Medication Profile" ? (
            <Link
              className={styles.patientActionInlineLink}
              href={`/portal/patients/${patient.id}/medication`}
              key={label}
              prefetch={false}
            >
              {label}
            </Link>
          ) : label === "Care Plans" ? (
            <Link
              className={styles.patientActionInlineLink}
              href={`/portal/patients/${patient.id}/care-plans`}
              key={label}
              prefetch={false}
            >
              {label}
            </Link>
          ) : (
            <button
              className={styles.patientActionInlineButton}
              key={label}
              onClick={() => window.alert(`${label} is the next portal slice.`)}
              type="button"
            >
              {label}
            </button>
          ),
        )}
      </div>

      <div className={styles.patientOverviewGrid}>
        <article className={styles.patientOverviewPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>Current status</h3>
          </div>
          <div className={styles.patientOverviewBody}>
            {dashboard?.currentStatus.map((row) => (
              <div className={styles.patientSummaryRow} key={row.label}>
                <span>{row.label}</span>
                {renderOverviewValue(row)}
              </div>
            ))}
          </div>
        </article>

        <article className={styles.patientOverviewPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>Latest readings</h3>
          </div>
          <div className={styles.patientOverviewBody}>
            {dashboard?.latestReadings.map((row) => (
              <div className={styles.patientSummaryRow} key={row.label}>
                <span>
                  {row.label}
                  {row.meta ? (
                    <small className={styles.patientSummaryMeta}>{row.meta}</small>
                  ) : null}
                </span>
                {renderOverviewValue(row)}
              </div>
            ))}
          </div>
        </article>

        <article className={styles.patientOverviewPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>Care plan snapshot</h3>
          </div>
          <div className={styles.patientOverviewBody}>
            {dashboard?.carePlanSnapshot ? (
              <>
                <div className={styles.patientSummaryRow}>
                  <span>Latest plan</span>
                  {dashboard.carePlanSnapshot.href ? (
                    <Link
                      className={styles.patientPanelLink}
                      href={dashboard.carePlanSnapshot.href}
                      prefetch={false}
                    >
                      {dashboard.carePlanSnapshot.title}
                    </Link>
                  ) : (
                    <strong>{dashboard.carePlanSnapshot.title}</strong>
                  )}
                </div>
                <div className={styles.patientSummaryRow}>
                  <span>Status</span>
                  {dashboard.carePlanSnapshot.href ? (
                    <Link
                      className={styles.patientPanelLink}
                      href={dashboard.carePlanSnapshot.href}
                      prefetch={false}
                    >
                      {dashboard.carePlanSnapshot.status}
                    </Link>
                  ) : (
                    <strong>{dashboard.carePlanSnapshot.status}</strong>
                  )}
                </div>
                <div className={styles.patientSummaryRow}>
                  <span>Open tasks</span>
                  {dashboard.carePlanSnapshot.href ? (
                    <Link
                      className={styles.patientPanelLink}
                      href={dashboard.carePlanSnapshot.href}
                      prefetch={false}
                    >
                      {dashboard.carePlanSnapshot.openTasksLabel}
                    </Link>
                  ) : (
                    <strong>{dashboard.carePlanSnapshot.openTasksLabel}</strong>
                  )}
                </div>
                <div className={styles.patientSummaryRow}>
                  <span>Next review</span>
                  {dashboard.carePlanSnapshot.href ? (
                    <Link
                      className={styles.patientPanelLink}
                      href={dashboard.carePlanSnapshot.href}
                      prefetch={false}
                    >
                      {formatDisplayDate(dashboard.carePlanSnapshot.nextReviewAt, {
                        fallback: dashboard.carePlanSnapshot.reviewLabel
                          ? `Review cadence ${dashboard.carePlanSnapshot.reviewLabel}`
                          : "Not set",
                      })}
                    </Link>
                  ) : (
                    <strong>
                      {formatDisplayDate(dashboard.carePlanSnapshot.nextReviewAt, {
                        fallback: dashboard.carePlanSnapshot.reviewLabel
                          ? `Review cadence ${dashboard.carePlanSnapshot.reviewLabel}`
                          : "Not set",
                      })}
                    </strong>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.patientPanelEmpty}>No care plans recorded yet.</div>
            )}
          </div>
        </article>

        <article className={styles.patientOverviewPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>Attention needed</h3>
          </div>
          <div className={styles.patientOverviewBody}>
            <div className={styles.patientAttentionList}>
              {dashboard?.attentionItems.map((item) => (
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
          </div>
        </article>
      </div>

      <div className={styles.patientSummaryGrid}>
        <article className={styles.patientSummaryPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>31-day clinical trends</h3>
          </div>
          {dashboard?.clinicalSummary.map((row) => (
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
          {dashboard?.engagementSummary.map((row) => (
            <div className={styles.patientSummaryRow} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </article>
      </div>

      <article className={styles.patientOverviewPanel}>
        <div className={styles.patientOverviewHeader}>
          <h3 className={styles.patientOverviewTitle}>Recent activity</h3>
        </div>
        <div className={styles.patientOverviewBody}>
          {dashboard?.recentActivity.length ? (
            <div className={styles.patientActivityList}>
              {dashboard.recentActivity.map((item) => (
                <div className={styles.patientActivityRow} key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    {item.detail ? (
                      <p className={styles.patientActivityDetail}>{item.detail}</p>
                    ) : null}
                  </div>
                  <span className={styles.patientActivityAt}>
                    {formatDisplayDate(item.at, { includeTime: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.patientPanelEmpty}>No recent activity to show.</div>
          )}
        </div>
      </article>

    </section>
  );
}
