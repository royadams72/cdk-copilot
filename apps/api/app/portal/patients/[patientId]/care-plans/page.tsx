"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import type { PortalPatientCarePlanData } from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalCarePlansResponse = {
  data: PortalPatientCarePlanData;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatusLabel(
  status: PortalPatientCarePlanData["rows"][number]["status"],
) {
  switch (status) {
    case "active":
      return "Active";
    case "completed":
      return "Complete";
    case "archived":
      return "Archived";
    case "draft":
      return "Draft";
    default:
      return status;
  }
}

function getStatusTone(
  status: PortalPatientCarePlanData["rows"][number]["status"],
) {
  switch (status) {
    case "active":
      return "success";
    case "completed":
      return "danger";
    case "archived":
      return "muted";
    case "draft":
      return "accent";
    default:
      return "muted";
  }
}

export default function PortalPatientCarePlansPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalSession();
  const [data, setData] = useState<PortalPatientCarePlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadCarePlans() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/care-plans`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalCarePlansResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load care plans",
          );
        }

        setData(body.data);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load care plans",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadCarePlans();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>Loading care plans...</section>
    );
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Care plans unavailable</h2>
        <p>{error ?? "The requested care plans could not be loaded."}</p>
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
      <div className={styles.carePlanHero}>
        <PortalPatientSubpageHeader
          action={
            <button
              className={styles.buttonPrimarySmall}
              onClick={() =>
                window.alert("Add Care Plan is the next care-plan slice.")
              }
              type="button"
            >
              Add Care Plan
            </button>
          }
          backHref={patientHref}
          backLabel="Back to patient"
          headline={data.headline}
        />
      </div>

      <section className={styles.carePlanListCard}>
        <div className={styles.patientList}>
          {data.rows.length ? (
            data.rows.map((row) => (
              <article
                className={`${styles.patientListRow} ${styles.carePlanRow}`}
                key={row.id}
              >
                <div className={styles.carePlanRowMain}>
                  <Link
                    className={styles.patientLink}
                    href={`/portal/patients/${data.patient.id}/care-plans/${row.id}`}
                  >
                    {row.title}
                  </Link>
                  <div className={styles.carePlanRowMeta}>
                    <span>{row.goalsCount} goals</span>
                    <span>{row.tasksCount} tasks</span>
                    <span>{row.openTasksCount} open</span>
                    <span>Updated {formatDate(row.updatedAt)}</span>
                  </div>
                  {row.notes ? (
                    <div className={styles.carePlanRowNote}>{row.notes}</div>
                  ) : null}
                </div>
                <div
                  className={styles.carePlanStatus}
                  data-tone={getStatusTone(row.status)}
                >
                  {formatStatusLabel(row.status)}
                </div>
              </article>
            ))
          ) : (
            <article
              className={`${styles.patientListRow} ${styles.carePlanRow}`}
            >
              <div className={styles.carePlanRowMain}>
                <div className={styles.carePlanRowTitle}>
                  No care plans recorded yet
                </div>
                <div className={styles.carePlanRowMeta}>
                  <span>
                    This patient does not yet have an active, draft, or
                    completed care plan.
                  </span>
                </div>
              </div>
            </article>
          )}
        </div>
      </section>
    </section>
  );
}
