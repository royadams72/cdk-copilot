"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import type {
  PortalPatientFilter,
  PortalPatientListItem,
  PortalPatientStat,
} from "@/apps/api/lib/portal/patient-shared";
import { normalizePortalPatientFilter } from "@/apps/api/lib/portal/patient-shared";

type PortalPatientsResponse = {
  data: {
    filter: PortalPatientFilter;
    matchedPatients: number;
    patients: PortalPatientListItem[];
    query: string;
    stats: Record<Exclude<PortalPatientFilter, "all">, PortalPatientStat>;
    totalPatients: number;
  };
};

export function PortalDashboard() {
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
      if (activeFilter !== "all") {
        params.set("filter", activeFilter);
      }

      try {
        const response = await fetch(
          `/api/portal/patients${params.size ? `?${params.toString()}` : ""}`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );

        const body = (await response.json().catch(() => null)) as
          | PortalPatientsResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load patients",
          );
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
  }, [activeFilter, session, status, submittedQuery]);

  const statCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      { filter: "worsening" as const, ...stats.worsening },
      { filter: "review" as const, ...stats.review },
      { filter: "disengaged" as const, ...stats.disengaged },
      { filter: "endingSoon" as const, ...stats.endingSoon },
    ];
  }, [stats]);

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

  return (
    <>
      <section className={styles.statGrid}>
        {statCards.map((card) => (
          <article
            className={styles.statCard}
            data-active={activeFilter === card.filter}
            data-tone={card.tone}
            key={card.label}
          >
            <div className={styles.statCardBody}>
              <h2 className={styles.statTitle}>{card.label}</h2>
              <strong className={styles.statValue}>
                {card.count} {card.count === 1 ? "patient" : "patients"}
              </strong>
              <p className={styles.statDetail}>{card.detail}</p>
            </div>
            <button
              className={styles.cardAction}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                if (activeFilter === card.filter) {
                  params.delete("filter");
                } else {
                  params.set("filter", card.filter);
                }
                router.push(
                  `/portal${params.size ? `?${params.toString()}` : ""}`,
                );
              }}
              type="button"
            >
              {activeFilter === card.filter ? "Show all" : "View patients"}
            </button>
            <span className={styles.iconBadge}>
              <Image alt="" height={24} src={card.icon} width={24} />
            </span>
          </article>
        ))}
      </section>
      <section className={styles.metaStrip}>
        <span>
          Showing <strong>{matchedPatients}</strong> of{" "}
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
      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Patient list</span>
          <span className={styles.listHeaderMeta}>
            {activeFilter === "all"
              ? "All accessible patients"
              : `Filtered by ${activeFilter}`}
          </span>
        </div>

        {patientsError ? (
          <div className={styles.emptyState}>
            <h2>Unable to load patients</h2>
            <p>{patientsError}</p>
          </div>
        ) : patientsLoading ? (
          <div className={styles.emptyState}>Loading patient list...</div>
        ) : patients.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No patients match this view</h2>
            <p>Try another search term or clear the active dashboard filter.</p>
          </div>
        ) : (
          <div className={styles.patientList}>
            {patients.map((patient) => (
              <div className={styles.patientListRow} key={patient.id}>
                <div className={styles.patientLabelBlock}>
                  <Link
                    className={styles.patientLink}
                    href={`/portal/patients/${patient.id}`}
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
                      router.push(`/portal/patients/${patient.id}`)
                    }
                    type="button"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {warningOpen && isLeaderTab ? (
        <div className={styles.warningModalBackdrop}>
          <div className={`${styles.modalCard} ${styles.modalWarning}`}>
            <h3 className={styles.modalTitle}>Session warning</h3>
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
          </div>
        </div>
      ) : null}
    </>
  );
}
