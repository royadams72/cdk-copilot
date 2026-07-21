"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import { PortalDialog } from "@/apps/api/app/portal/components/PortalDialog";
import { PortalTrendSearch } from "@/apps/api/app/portal/components/PortalTrendSearch";
import { readResponseMessage } from "@/apps/api/lib/http/response-message";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import type {
  PortalPatientFilter,
  PortalPatientListItem,
  PortalPatientMembershipStatusFilter,
  PortalPatientStat,
} from "@/apps/api/lib/portal/patient-shared";
import {
  normalizePortalPatientFilter,
  normalizePortalPatientMembershipStatusFilter,
} from "@/apps/api/lib/portal/patient-shared";

type PortalPatientsResponse = {
  data: {
    filter: PortalPatientFilter;
    matchedPatients: number;
    membershipStatus: PortalPatientMembershipStatusFilter;
    patients: PortalPatientListItem[];
    query: string;
    stats: Record<Exclude<PortalPatientFilter, "all">, PortalPatientStat>;
    totalPatients: number;
  };
};

type PortalNotifyPatientsResponse = {
  data: {
    attemptedPatients: number;
    delivered: number;
    failed: number;
    notifiedPatientIds: string[];
  };
};
type ReviewComposerState = {
  episodeIds?: string[];
  patientIds?: string[];
  title: string;
} | null;

function normalizeReviewType(
  value: string | null,
): "all" | "carePlans" | "renalGuidance" {
  switch (value) {
    case "carePlans":
    case "renalGuidance":
      return value;
    default:
      return "all";
  }
}

export function PortalDashboard() {
  return (
    <Suspense fallback={<PortalLoadingState label="Loading portal..." />}>
      <PortalDashboardContent />
    </Suspense>
  );
}

function PortalDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clearWarning, isLeaderTab, logout, session, status, warningOpen } =
    usePortalSession();
  const [patients, setPatients] = useState<PortalPatientListItem[]>([]);
  const [stats, setStats] = useState<Record<
    Exclude<PortalPatientFilter, "all">,
    PortalPatientStat
  > | null>(null);
  const [matchedPatients, setMatchedPatients] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const activeFilter = normalizePortalPatientFilter(searchParams.get("filter"));
  const activeReviewType = normalizeReviewType(searchParams.get("reviewType"));
  const activeMembershipStatus = normalizePortalPatientMembershipStatusFilter(
    searchParams.get("membershipStatus"),
  );
  const submittedQuery = searchParams.get("q")?.trim() ?? "";

  useEffect(() => {
    if (status !== "authenticated" || !session) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadPatients() {
      setPatientsLoading(true);
      setPatientsError(null);

      const params = new URLSearchParams();
      if (submittedQuery.trim()) {
        params.set("q", submittedQuery.trim());
      }
      if (activeFilter !== "all" && activeFilter !== "search") {
        params.set("filter", activeFilter);
      }
      if (activeMembershipStatus !== "active") {
        params.set("membershipStatus", activeMembershipStatus);
      }

      try {
        const response = await fetch(
          `/api/portal/patients${params.size ? `?${params.toString()}` : ""}`,
          {
            cache: "no-store",
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );

        const body = (await response.json().catch(() => null)) as
          | PortalPatientsResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(readResponseMessage(body, "Unable to load patients"));
        }

        setPatients(body.data.patients);
        setStats(body.data.stats);
        setMatchedPatients(body.data.matchedPatients);
        setTotalPatients(body.data.totalPatients);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setPatients([]);
        setPatientsError(
          error instanceof Error ? error.message : "Unable to load patients",
        );
      } finally {
        if (!controller.signal.aborted) {
          setPatientsLoading(false);
        }
      }
    }

    loadPatients();
    return () => controller.abort();
  }, [activeFilter, activeMembershipStatus, session, status, submittedQuery]);

  const statCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        actionLabel: "Open search",
        count: null,
        detail: "Choose recorded items and directions",
        filter: "search" as const,
        icon: "/portal/icons/trend icon.png",
        label: "Advanced search",
        tone: "accent" as const,
        valueLabelPlural: "",
        valueLabelSingular: "",
      },
      { filter: "review" as const, ...stats.review },
      { filter: "disengaged" as const, ...stats.disengaged },
      { filter: "endingSoon" as const, ...stats.endingSoon },
    ];
  }, [stats]);

  const carePlanReviewPatients = useMemo(
    () => patients.filter((patient) => patient.reviewDueCount > 0),
    [patients],
  );
  const carePlanReviewTotal = useMemo(
    () =>
      carePlanReviewPatients.reduce(
        (sum, patient) => sum + patient.reviewDueCount,
        0,
      ),
    [carePlanReviewPatients],
  );
  const renalGuidanceReviewPatients = useMemo(
    () => patients.filter((patient) => patient.renalGuidanceReviewDueCount > 0),
    [patients],
  );
  const renalGuidanceReviewTotal = useMemo(
    () =>
      renalGuidanceReviewPatients.reduce(
        (sum, patient) => sum + patient.renalGuidanceReviewDueCount,
        0,
      ),
    [renalGuidanceReviewPatients],
  );
  const reviewPatients = useMemo(() => {
    switch (activeReviewType) {
      case "carePlans":
        return carePlanReviewPatients;
      case "renalGuidance":
        return renalGuidanceReviewPatients;
      case "all":
      default:
        return patients.filter(
          (patient) =>
            patient.reviewDueCount > 0 ||
            patient.renalGuidanceReviewDueCount > 0,
        );
    }
  }, [
    activeReviewType,
    carePlanReviewPatients,
    patients,
    renalGuidanceReviewPatients,
  ]);

  if (status === "loading") {
    return (
      <section className={styles.emptyState}>
        Checking portal session...
      </section>
    );
  }

  if (status !== "authenticated" || !session) {
    return (
      <section className={styles.emptyState}>
        <h2>Portal session required</h2>
        <p>Use the temporary bootstrap form to load a JWT and refresh token.</p>
        <Link className={styles.inlineLink} href="/login">
          Open login
        </Link>
      </section>
    );
  }

  const authenticatedSession = session;

  return (
    <div className={styles.detailLayout}>
      <h1 className={styles.visuallyHidden}>Patient dashboard</h1>
      <section className={styles.statGrid}>
        {statCards.map((card) => (
          <article
            className={styles.statCard}
            data-tone={card.tone}
            key={card.label}
          >
            <div className={styles.statCardBody}>
              <h2 className={styles.statTitle}>{card.label}</h2>
              <strong className={styles.statValue}>
                {card.count ?? "Search"}
                {card.count === null
                  ? ""
                  : card.count === 1
                    ? (card.valueLabelSingular ?? " patient")
                    : (card.valueLabelPlural ?? " patients")}
              </strong>
              {card.filter === "review" ? (
                <div className={styles.statDetailLines}>
                  <div className={styles.statDetailLine}>
                    <span>
                      {carePlanReviewTotal} care plan
                      {carePlanReviewTotal === 1 ? "" : "s"}
                    </span>
                    <button
                      className={styles.statInlineAction}
                      onClick={() => {
                        const params = new URLSearchParams(
                          searchParams.toString(),
                        );
                        params.set("filter", "review");
                        params.set("reviewType", "carePlans");
                        router.push(`/portal?${params.toString()}`);
                      }}
                      type="button"
                    >
                      View
                    </button>
                  </div>
                  <div className={styles.statDetailLine}>
                    <span>{renalGuidanceReviewTotal} renal guidance</span>
                    <button
                      className={styles.statInlineAction}
                      onClick={() => {
                        const params = new URLSearchParams(
                          searchParams.toString(),
                        );
                        params.set("filter", "review");
                        params.set("reviewType", "renalGuidance");
                        router.push(`/portal?${params.toString()}`);
                      }}
                      type="button"
                    >
                      View
                    </button>
                  </div>
                </div>
              ) : (
                <p className={styles.statDetail}>{card.detail}</p>
              )}
            </div>
            <button
              className={styles.cardAction}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                if (activeFilter === card.filter) {
                  params.delete("filter");
                  if (card.filter === "review") {
                    params.delete("reviewType");
                  }
                } else {
                  params.set("filter", card.filter);
                  if (card.filter === "search") {
                    params.delete("membershipStatus");
                  }
                  if (card.filter === "review") {
                    params.set("reviewType", "all");
                  }
                }
                router.push(
                  `/portal${params.size ? `?${params.toString()}` : ""}`,
                );
              }}
              type="button"
            >
              {card.filter === "review"
                ? activeFilter === "review"
                  ? "Show all"
                  : (card.actionLabel ?? "View reviews")
                : activeFilter === card.filter
                  ? "Show all"
                  : (card.actionLabel ?? "View patients")}
            </button>
            <span className={styles.iconBadge}>
              <Image alt="" height={24} src={card.icon} width={24} />
            </span>
          </article>
        ))}
      </section>
      {!patientsLoading && activeFilter !== "search" ? (
        <section className={styles.metaStrip}>
          <span>
            Showing
            <select
              className={styles.compactSelect}
              onChange={(event) => {
                const params = new URLSearchParams(searchParams.toString());
                const nextValue = normalizePortalPatientMembershipStatusFilter(
                  event.target.value,
                );
                if (nextValue === "active") {
                  params.delete("membershipStatus");
                } else {
                  params.set("membershipStatus", nextValue);
                }
                router.push(
                  `/portal${params.size ? `?${params.toString()}` : ""}`,
                );
              }}
              value={activeMembershipStatus}
            >
              <option value="active">active</option>
              <option value="inactive">suspended</option>
              <option value="expired">expired</option>
              <option value="ended">ended</option>
              <option value="pending">pending</option>
              <option value="all">all</option>
            </select>
            patients. <strong>{matchedPatients}</strong> of
            <strong>{totalPatients}</strong> accessible patients
          </span>
          {submittedQuery ? (
            <button
              className={styles.buttonGhost}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("q");
                router.push(
                  `/portal${params.size ? `?${params.toString()}` : ""}`,
                );
              }}
              type="button"
            >
              Clear search
            </button>
          ) : null}
        </section>
      ) : null}
      <section className={styles.panelSurface}>
        {activeFilter === "search" ? (
          <PortalTrendSearch />
        ) : patientsError ? (
          <div className={styles.emptyState}>
            <h2>Unable to load patients</h2>
            <p>{patientsError}</p>
          </div>
        ) : patientsLoading ? (
          <PortalLoadingState label="Loading patient list..." />
        ) : patients.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No patients match this view</h2>
            <p>Try another search term or clear the active dashboard filter.</p>
          </div>
        ) : (
          <>
            <div className={styles.listHeaderRow}>
              <span className={styles.listHeaderTitle}>Patient list</span>
              <span className={styles.listHeaderMeta}>
                {activeFilter === "all"
                  ? "All accessible patients"
                  : activeFilter === "review"
                    ? activeReviewType === "renalGuidance"
                      ? "Filtered by renal guidance reviews"
                      : activeReviewType === "carePlans"
                        ? "Filtered by care plan reviews"
                        : "Filtered by reviews due"
                    : `Filtered by ${activeFilter}`}
              </span>
            </div>
            <div className={styles.patientList}>
              {(activeFilter === "review" ? reviewPatients : patients).map(
                (patient) => (
                  <div className={styles.patientListRow} key={patient.id}>
                    <div className={styles.patientLabelBlock}>
                      <Link
                        className={styles.patientLink}
                        href={
                          activeFilter === "review" &&
                          activeReviewType === "renalGuidance" &&
                          patient.reviewRenalGuidanceHref
                            ? patient.reviewRenalGuidanceHref
                            : activeFilter === "review" &&
                                activeReviewType !== "renalGuidance" &&
                                patient.reviewCarePlanHref
                              ? patient.reviewCarePlanHref
                              : activeFilter === "review" &&
                                  patient.reviewRenalGuidanceHref
                                ? patient.reviewRenalGuidanceHref
                                : `/portal/patients/${patient.id}`
                        }
                      >
                        {patient.name}
                      </Link>
                      <div className={styles.patientSubline}>
                        <span>{patient.dateOfBirth ?? "DOB missing"}</span>
                        <span>{patient.email ?? "Email missing"}</span>
                        <span>Stage {patient.stage ?? "Not set"}</span>
                      </div>
                    </div>
                    <div className={styles.patientActions}>
                      <button
                        className={styles.buttonPrimaryCompact}
                        onClick={() =>
                          router.push(
                            activeFilter === "review" &&
                              activeReviewType === "renalGuidance" &&
                              patient.reviewRenalGuidanceHref
                              ? patient.reviewRenalGuidanceHref
                              : activeFilter === "review" &&
                                  activeReviewType !== "renalGuidance" &&
                                  patient.reviewCarePlanHref
                                ? patient.reviewCarePlanHref
                                : activeFilter === "review" &&
                                    patient.reviewRenalGuidanceHref
                                  ? patient.reviewRenalGuidanceHref
                                  : `/portal/patients/${patient.id}`,
                          )
                        }
                        type="button"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
            {activeFilter === "review" && reviewPatients.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>No patients match this review view</h2>
                <p>
                  {activeReviewType === "renalGuidance"
                    ? "There are no renal guidance reviews due right now."
                    : "There are no care plan reviews due right now."}
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>

      {warningOpen && isLeaderTab ? (
        <PortalDialog
          className={styles.modalWarning}
          labelledBy="session-warning-dialog-title"
        >
          <h2 className={styles.modalTitle} id="session-warning-dialog-title">
            Session warning
          </h2>
          <p className={styles.modalCopy}>
            No activity has been detected for 18 minutes. Interact with the
            portal to keep the session alive.
          </p>
          <div className={styles.warningActions}>
            <button
              className={styles.buttonSecondarySmall}
              onClick={clearWarning}
              type="button"
            >
              Stay signed in
            </button>
            <button
              className={styles.buttonPrimarySmall}
              onClick={() => logout("manual")}
              type="button"
            >
              Log out now
            </button>
          </div>
        </PortalDialog>
      ) : null}
    </div>
  );
}
