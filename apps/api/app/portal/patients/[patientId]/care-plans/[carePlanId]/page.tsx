"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import type { PortalPatientCarePlanDetailData } from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalCarePlanDetailResponse = {
  data: PortalPatientCarePlanDetailData;
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
  status: PortalPatientCarePlanDetailData["plan"]["status"],
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

export default function PortalPatientCarePlanDetailPage() {
  const params = useParams<{ carePlanId: string; patientId: string }>();
  const router = useRouter();
  const { session, status } = usePortalSession();
  const [data, setData] = useState<PortalPatientCarePlanDetailData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draftAction, setDraftAction] = useState<"activate" | "delete">(
    "activate",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !session ||
      !params.patientId ||
      !params.carePlanId
    ) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadCarePlan() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/care-plans/${params.carePlanId}`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalCarePlanDetailResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load care plan",
          );
        }

        setData(body.data);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load care plan",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadCarePlan();
    return () => controller.abort();
  }, [params.carePlanId, params.patientId, session, status]);

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>Loading care plan...</section>
    );
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Care plan unavailable</h2>
        <p>{error ?? "The requested care plan could not be loaded."}</p>
      </section>
    );
  }

  const patientHref = data.patient?.id
    ? `/portal/patients/${data.patient.id}`
    : params.patientId
      ? `/portal/patients/${params.patientId}`
      : "/portal";
  const carePlansHref = `${patientHref}/care-plans`;

  async function runAction(
    action: "complete" | "activate" | "archive" | "delete",
  ) {
    if (!session || !params.patientId || !params.carePlanId || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/care-plans/${params.carePlanId}`,
        {
          body: JSON.stringify({ action }),
          headers: {
            ...getPortalSessionAuthHeaders(session.jwt),
            "Content-Type": "application/json",
          },
          method: "PATCH",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | PortalCarePlanDetailResponse
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to update care plan",
        );
      }

      if (action === "delete") {
        router.push(carePlansHref);
        router.refresh();
        return;
      }

      setData(body.data);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update care plan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.patientHeadlineContainer}>
        <Link className={styles.patientBackLink} href={carePlansHref}>
          &larr; Back to care plans
        </Link>
        <div className={styles.patientHeadline}>
          <span aria-hidden="true" className={styles.patientHeadlineIcon}>
            <span className={styles.patientHeadlineAvatarHead} />
            <span className={styles.patientHeadlineAvatarBody} />
          </span>
          <div className={styles.patientHeadlineContent}>
            <div className={styles.patientHeadlineRow}>
              <div className={styles.patientHeadlineText}>
                {data.patient.name}
              </div>
            </div>
          </div>
        </div>
        <span aria-hidden="true" className={styles.patientBackLinkSpacer}>
          Back to care plans
        </span>
      </div>

      {error ? <p className={styles.dataScreenCaption}>{error}</p> : null}

      <div className={styles.carePlanTitleRow}>
        <div className={styles.carePlanTitleBlock}>
          <h2 className={styles.carePlanPrimaryTitle}>{data.plan.title}</h2>
        </div>
        <div
          className={styles.carePlanStatusInline}
          data-tone={
            data.plan.status === "active"
              ? "success"
              : data.plan.status === "completed"
                ? "danger"
                : data.plan.status === "draft"
                  ? "accent"
                  : "muted"
          }
        >
          {formatStatusLabel(data.plan.status)}
        </div>
        <div className={styles.carePlanActionCell}>
          {data.plan.status === "draft" ? (
            <div className={styles.carePlanActionGroup}>
              <label
                className={styles.visuallyHidden}
                htmlFor="care-plan-draft-action"
              >
                Draft care plan action
              </label>
              <select
                className={styles.nutritionFilterSelect}
                id="care-plan-draft-action"
                onChange={(event) =>
                  setDraftAction(event.target.value as "activate" | "delete")
                }
                value={draftAction}
              >
                <option value="activate">Active</option>
                <option value="delete">Delete</option>
              </select>
              <button
                className={styles.buttonPrimarySmall}
                disabled={submitting}
                onClick={() => void runAction(draftAction)}
                type="button"
              >
                {submitting ? "Saving..." : "Apply"}
              </button>
            </div>
          ) : data.plan.status === "completed" ? (
            <button
              className={styles.buttonPrimarySmall}
              disabled={submitting}
              onClick={() => void runAction("archive")}
              type="button"
            >
              {submitting ? "Saving..." : "Archive"}
            </button>
          ) : data.plan.status !== "archived" ? (
            <button
              className={styles.buttonPrimarySmall}
              disabled={submitting}
              onClick={() => void runAction("complete")}
              type="button"
            >
              {submitting ? "Saving..." : "Set complete"}
            </button>
          ) : null}
        </div>
      </div>

      <section className={styles.detailGrid}>
        <article className={styles.detailCard}>
          <div className={styles.cardBody}>
            <div className={styles.carePlanMetaHeaderRow}>
              <h3 className={styles.carePlanMetaTitle}>Activated</h3>
              <h3 className={styles.carePlanMetaTitle}>Completed</h3>
              <h3 className={styles.carePlanMetaTitle}>Created by</h3>
              <h3 className={styles.carePlanMetaTitle}>Updated by</h3>
            </div>
            <div className={styles.carePlanFactsContentRow}>
              <div className={styles.carePlanMetaValue}>
                {formatDate(data.plan.activatedAt)}
              </div>
              <div className={styles.carePlanMetaValue}>
                {formatDate(data.plan.completedAt)}
              </div>
              <div className={styles.carePlanMetaValue}>{data.plan.createdBy}</div>
              <div className={styles.carePlanMetaValue}>{data.plan.updatedBy}</div>
            </div>
            {data.plan.notes ? (
              <p className={styles.carePlanDetailNotes}>{data.plan.notes}</p>
            ) : null}
          </div>
        </article>

        <article className={styles.detailCard}>
          <div className={styles.cardBody}>
            <div className={styles.carePlanMetaHeaderRow}>
              <h3 className={styles.carePlanPanelTitle}>Associated diagnoses</h3>
              <h3 className={styles.carePlanPanelTitle}>Owners</h3>
              <h3 className={styles.carePlanPanelTitle}>Review in</h3>
            </div>
            <div className={styles.carePlanMetaContentRow}>
              <div className={styles.carePlanMetaCell}>
                {data.plan.diagnoses.length ? (
                  <div className={styles.carePlanPlainList}>
                    {data.plan.diagnoses.map((diagnosis) => (
                      <div
                        className={styles.carePlanPlainItem}
                        key={diagnosis.id}
                      >
                        {diagnosis.label}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.dataScreenCaption}>
                    No diagnoses linked.
                  </p>
                )}
              </div>
              <div className={styles.carePlanMetaCell}>
                {data.plan.ownerLabels.length ? (
                  <div className={styles.carePlanPlainList}>
                    {data.plan.ownerLabels.map((label) => (
                      <div className={styles.carePlanPlainItem} key={label}>
                        {label}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.dataScreenCaption}>
                    No owners selected.
                  </p>
                )}
              </div>
              <div className={styles.carePlanMetaCell}>
                <p className={styles.carePlanMetaValue}>
                  {data.plan.reviewLabel ?? "Not set"}
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.dataScreenCard}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h2 className={styles.dataScreenTitle}>Goals</h2>
            <p className={styles.dataScreenCaption}>
              Goals linked to this care plan.
            </p>
          </div>
        </div>
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Target summary</th>
              </tr>
            </thead>
            <tbody>
              {data.plan.goals.length ? (
                data.plan.goals.map((goal) => (
                  <tr key={goal.id}>
                    <td>{goal.label}</td>
                    <td>{goal.targetSummary ?? "No target summary"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    No goals were recorded for this care plan.
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
            <h2 className={styles.dataScreenTitle}>Tasks</h2>
            <p className={styles.dataScreenCaption}>
              Daily, weekly, or once-off plan actions.
            </p>
          </div>
        </div>
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Task</th>
                <th>Frequency</th>
                <th>Status</th>
                <th>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {data.plan.tasks.length ? (
                data.plan.tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.label}</td>
                    <td>{task.freq}</td>
                    <td>{task.status}</td>
                    <td>{task.instructions ?? "No instructions"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    No tasks were recorded for this care plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
