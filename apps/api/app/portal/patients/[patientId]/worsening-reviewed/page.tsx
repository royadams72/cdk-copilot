"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import type { PortalPatientWorseningItem } from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import PatientHeadlineContainer from "../../components/PatientHeadlineContainer";

type ReviewedWorseningResponse = {
  data: {
    items: PortalPatientWorseningItem[];
    patientId: string;
  };
};

export default function ReviewedWorseningTrendsPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalSession();
  const jwt = session?.jwt;
  const [items, setItems] = useState<PortalPatientWorseningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !jwt || !params.patientId) {
      return;
    }

    const controller = new AbortController();
    const jwtForRequest = jwt;

    async function loadReviewedItems() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/worsening-reviewed`,
          {
            headers: getPortalSessionAuthHeaders(jwtForRequest),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | ReviewedWorseningResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load reviewed worsening trends",
          );
        }

        setItems(body.data.items);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load reviewed worsening trends",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadReviewedItems();
    return () => controller.abort();
  }, [jwt, params.patientId, status]);

  return (
    <section className={styles.detailLayout}>
      <PatientHeadlineContainer
        backHref={`/portal/patients/${params.patientId}`}
        backLabel="Back to patient"
        headline="Reviewed follow-up items"
        subheadline="Hidden from the live self-management follow-up list after review"
      />

      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Reviewed follow-up items</span>
          <span className={styles.listHeaderMeta}>
            Hidden from the live self-management follow-up list after review
          </span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading reviewed follow-up items...</div>
        ) : error ? (
          <div className={styles.emptyState}>
            <h2>Unable to load reviewed follow-up items</h2>
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No reviewed follow-up items yet</h2>
            <p>Reviewed self-management follow-up items for this patient will appear here.</p>
          </div>
        ) : (
          <div className={styles.worseningModalList}>
            {items.map((item) => (
              <div
                className={styles.worseningModalItem}
                key={`${item.episodeId}-${item.reviewedAt ?? "unreviewed"}`}
              >
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
                <span>
                  {item.reviewedAt
                    ? `Reviewed ${formatDisplayDate(item.reviewedAt)}`
                    : "Reviewed"}
                  {item.reviewedByRole
                    ? ` by ${item.reviewedByRole.replace(/_/g, " ")}`
                    : ""}
                  {item.firstDetectedAt
                    ? ` · First detected ${formatDisplayDate(item.firstDetectedAt)}`
                    : ""}
                </span>
                {item.reviewedByName || item.reviewedByPrincipalId ? (
                  <span>
                    Reviewer: {item.reviewedByName ?? item.reviewedByPrincipalId}
                  </span>
                ) : null}
                {item.href ? (
                  <Link className={styles.tableLink} href={item.href} prefetch={false}>
                    Open related section
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
