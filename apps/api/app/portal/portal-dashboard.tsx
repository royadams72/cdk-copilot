"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import type {
  PortalPatientFilter,
  PortalPatientListItem,
  PortalPatientStat,
  PortalPatientWorseningItem,
  PortalWorseningKind,
} from "@/apps/api/lib/portal/patient-shared";
import {
  normalizePortalPatientFilter,
  normalizePortalWorseningKind,
} from "@/apps/api/lib/portal/patient-shared";

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

type PortalNotifyPatientsResponse = {
  data: {
    attemptedPatients: number;
    delivered: number;
    failed: number;
    notifiedPatientIds: string[];
  };
};

const worseningFilterOptions: Array<{
  label: string;
  value: PortalWorseningKind;
}> = [
  { label: "All worsening", value: "all" },
  { label: "Blood pressure", value: "bloodPressure" },
  { label: "Weight increase", value: "weightIncrease" },
  { label: "Weight decrease", value: "weightDecrease" },
  { label: "Symptoms", value: "symptoms" },
  { label: "Activity", value: "activity" },
  { label: "Nutrition", value: "nutrition" },
];

function matchesWorseningFilter(
  patient: PortalPatientListItem,
  filter: PortalWorseningKind,
) {
  if (filter === "all") {
    return patient.worseningItems.length > 0;
  }

  return patient.worseningItems.some((item) => item.kind === filter);
}

function summarizeWorseningItems(items: PortalPatientWorseningItem[]) {
  const labels = items.map((item) => item.label);
  if (labels.length <= 2) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 2).join(", ")}...`;
}

export function PortalDashboard() {
  return (
    <Suspense
      fallback={
        <section className={styles.emptyState}>Loading portal...</section>
      }
    >
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
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [selectedWorseningFilter, setSelectedWorseningFilter] =
    useState<PortalWorseningKind>("all");
  const [selectedAction, setSelectedAction] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [detailsPatient, setDetailsPatient] = useState<PortalPatientListItem | null>(null);
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

  const worseningPatients = useMemo(
    () =>
      patients.filter((patient) =>
        matchesWorseningFilter(
          patient,
          normalizePortalWorseningKind(selectedWorseningFilter),
        ),
      ),
    [patients, selectedWorseningFilter],
  );

  const allVisibleWorseningSelected =
    worseningPatients.length > 0 &&
    worseningPatients.every((patient) => selectedPatientIds.includes(patient.id));

  useEffect(() => {
    setSelectedPatientIds((current) =>
      current.filter((id) => patients.some((patient) => patient.id === id)),
    );
  }, [patients]);

  useEffect(() => {
    setActionMessage(null);
    setActionError(null);
  }, [activeFilter, selectedWorseningFilter]);

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

  async function handleWorseningAction(value: string) {
    setSelectedAction(value);
    setActionError(null);
    setActionMessage(null);

    if (!value) {
      return;
    }

    if (!selectedPatientIds.length) {
      setActionError("Select one or more patients first.");
      setSelectedAction("");
      return;
    }

    if (value === "care-plan") {
      if (selectedPatientIds.length !== 1) {
        setActionError("Create care plan is available for one patient at a time.");
        setSelectedAction("");
        return;
      }

      router.push(`/portal/patients/${selectedPatientIds[0]}/care-plans/add`);
      return;
    }

    if (value === "notify") {
      setActionPending(true);
      try {
        const response = await fetch("/api/portal/patients/notify", {
          body: JSON.stringify({ patientIds: selectedPatientIds }),
          headers: {
            ...getPortalSessionAuthHeaders(authenticatedSession.jwt),
            "content-type": "application/json",
          },
          method: "POST",
        });

        const body = (await response.json().catch(() => null)) as
          | PortalNotifyPatientsResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to notify patients",
          );
        }

        setActionMessage(
          body.data.failed
            ? `Notified ${body.data.delivered} patient(s); ${body.data.failed} could not be delivered.`
            : `Notified ${body.data.delivered} patient(s).`,
        );
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to notify patients",
        );
      } finally {
        setActionPending(false);
        setSelectedAction("");
      }
    }
  }

  function togglePatientSelection(patientId: string) {
    setSelectedPatientIds((current) =>
      current.includes(patientId)
        ? current.filter((id) => id !== patientId)
        : [...current, patientId],
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
        ) : activeFilter === "worsening" ? (
          <>
            <div className={styles.listHeaderRow}>
              <span className={styles.listHeaderTitle}>
                Worsening trends for this month
              </span>
              <div className={styles.worseningToolbar}>
                <select
                  aria-label="Filter worsening trends"
                  className={styles.worseningSelect}
                  onChange={(event) =>
                    setSelectedWorseningFilter(
                      normalizePortalWorseningKind(event.target.value),
                    )
                  }
                  value={selectedWorseningFilter}
                >
                  {worseningFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Worsening trend actions"
                  className={styles.worseningSelect}
                  disabled={actionPending}
                  onChange={(event) => void handleWorseningAction(event.target.value)}
                  value={selectedAction}
                >
                  <option value="">Actions</option>
                  <option value="notify">Notify patient(s)</option>
                  <option value="care-plan">Create Care Plan</option>
                </select>
                <input
                  aria-label="Select all visible patients"
                  checked={allVisibleWorseningSelected}
                  className={styles.worseningCheckbox}
                  onChange={() => {
                    setSelectedPatientIds((current) =>
                      allVisibleWorseningSelected
                        ? current.filter(
                            (id) =>
                              !worseningPatients.some((patient) => patient.id === id),
                          )
                        : Array.from(
                            new Set([
                              ...current,
                              ...worseningPatients.map((patient) => patient.id),
                            ]),
                          ),
                    );
                  }}
                  type="checkbox"
                />
              </div>
            </div>
            {actionMessage ? (
              <div className={styles.metaStrip}>{actionMessage}</div>
            ) : null}
            {actionError ? (
              <div className={styles.emptyState}>
                <p>{actionError}</p>
              </div>
            ) : null}
            {worseningPatients.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>No patients match this worsening filter</h2>
                <p>Try another worsening category or clear the search term.</p>
              </div>
            ) : (
              <div className={styles.patientList}>
                {worseningPatients.map((patient) => (
                  <div className={styles.worseningRow} key={patient.id}>
                    <button
                      className={styles.worseningPatientButton}
                      onClick={() => setDetailsPatient(patient)}
                      type="button"
                    >
                      <span className={styles.worseningPatientName}>
                        {patient.name}
                      </span>
                      <span className={styles.worseningPatientMeta}>
                        {patient.dateOfBirth ?? "DOB missing"}
                        {patient.stage ? ` · Stage ${patient.stage}` : ""}
                      </span>
                    </button>
                    <div className={styles.worseningSignalBlock}>
                      <span className={styles.worseningSignalSummary}>
                        {summarizeWorseningItems(patient.worseningItems)}
                      </span>
                    </div>
                    <input
                      aria-label={`Select ${patient.name}`}
                      checked={selectedPatientIds.includes(patient.id)}
                      className={styles.worseningCheckbox}
                      onChange={() => togglePatientSelection(patient.id)}
                      type="checkbox"
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.listHeaderRow}>
              <span className={styles.listHeaderTitle}>Patient list</span>
              <span className={styles.listHeaderMeta}>
                {activeFilter === "all"
                  ? "All accessible patients"
                  : `Filtered by ${activeFilter}`}
              </span>
            </div>
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
          </>
        )}
      </section>

      {detailsPatient ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setDetailsPatient(null)}
        >
          <div
            className={`${styles.modalCard} ${styles.worseningModalCard}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>{detailsPatient.name}</h3>
            <p className={styles.modalCopy}>
              {detailsPatient.dateOfBirth ?? "DOB missing"}
              {detailsPatient.stage ? ` · Stage ${detailsPatient.stage}` : ""}
            </p>
            <div className={styles.worseningModalList}>
              {detailsPatient.worseningItems.map((item) => (
                <div className={styles.worseningModalItem} key={`${detailsPatient.id}-${item.kind}-${item.label}`}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
            <div className={styles.warningActions}>
              <button
                className={styles.buttonSecondarySmall}
                onClick={() => setDetailsPatient(null)}
                type="button"
              >
                Close
              </button>
              <button
                className={styles.buttonPrimarySmall}
                onClick={() => router.push(`/portal/patients/${detailsPatient.id}`)}
                type="button"
              >
                Open patient
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
