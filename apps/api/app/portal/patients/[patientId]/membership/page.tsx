"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type MembershipStatus =
  | "active"
  | "endingSoon"
  | "expired"
  | "inactive"
  | "ended"
  | "pending"
  | "unassigned";

type MembershipSnapshot = {
  assignmentId: string | null;
  careTeamId: string | null;
  computedStatus: MembershipStatus;
  consentStatus: string | null;
  daysRemaining: number | null;
  endsAt: string | null;
  facilityId: string | null;
  orgId: string | null;
  startsAt: string | null;
  status: string | null;
};

type MembershipEvent = {
  action: "extended" | "suspended" | "ended" | "reactivated";
  actorPrincipalId: string;
  actorRole: string;
  createdAt: string;
  nextEndsAt: string | null;
  nextStatus: string;
  note: string;
  previousEndsAt: string | null;
  previousStatus: string;
};

type MembershipResponse = {
  data: {
    events: MembershipEvent[];
    membership: MembershipSnapshot;
    patient: { id: string; name: string };
  };
};

type ActionType = "extend" | "suspend" | "end" | "reactivate";

function formatStatusLabel(status: MembershipStatus) {
  switch (status) {
    case "endingSoon":
      return "Ending soon";
    case "inactive":
      return "Suspended";
    case "ended":
      return "Ended";
    case "expired":
      return "Expired";
    case "pending":
      return "Pending";
    case "unassigned":
      return "Unassigned";
    case "active":
    default:
      return "Active";
  }
}

function formatActionLabel(action: MembershipEvent["action"]) {
  switch (action) {
    case "extended":
      return "Extended";
    case "suspended":
      return "Suspended";
    case "ended":
      return "Ended";
    case "reactivated":
      return "Reactivated";
  }
}

function formatTransitionLabel(event: MembershipEvent) {
  if (event.action === "extended" && event.previousStatus === event.nextStatus) {
    return `${event.previousStatus} membership extended`;
  }

  return `${event.previousStatus} to ${event.nextStatus}`;
}

export default function PortalPatientMembershipPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [patientName, setPatientName] = useState("Patient");
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [events, setEvents] = useState<MembershipEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ActionType>("extend");
  const [months, setMonths] = useState<"3" | "6" | "12">("3");
  const [note, setNote] = useState("");

  const requiresMonths = action === "extend" || action === "reactivate";

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const controller = new AbortController();
    const jwt = session.jwt;

    async function loadMembership() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/membership`,
          {
            headers: getPortalSessionAuthHeaders(jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | MembershipResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load membership",
          );
        }

        setEvents(body.data.events);
        setMembership(body.data.membership);
        setPatientName(body.data.patient.name);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load membership",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadMembership();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  const actionSummary = useMemo(() => {
    switch (action) {
      case "extend":
        return "Extend access by adding more time to the current end date.";
      case "suspend":
        return "Suspend access without ending the assignment.";
      case "end":
        return "End membership immediately and close access now.";
      case "reactivate":
        return "Restore access and set a new membership end date.";
    }
  }, [action]);

  async function submitAction() {
    if (!session || !params.patientId || !note.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/membership`,
        {
          body: JSON.stringify({
            action,
            ...(requiresMonths ? { months } : {}),
            note: note.trim(),
          }),
          headers: {
            ...getPortalSessionAuthHeaders(session.jwt),
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | MembershipResponse
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to update membership",
        );
      }

      setEvents(body.data.events);
      setMembership(body.data.membership);
      setPatientName(body.data.patient.name);
      setNote("");
      setMessage("Membership updated.");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update membership",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || loading) {
    return <section className={styles.emptyState}>Loading membership...</section>;
  }

  if (!membership) {
    return (
      <section className={styles.emptyState}>
        <h2>Membership unavailable</h2>
        <p>{error ?? "The membership record could not be loaded."}</p>
      </section>
    );
  }

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${params.patientId}`}
        backLabel="Back to patient"
        headline={`${patientName} membership`}
      />

      {message ? <section className={styles.metaStrip}>{message}</section> : null}
      {error ? (
        <section className={styles.emptyState}>
          <p>{error}</p>
        </section>
      ) : null}

      <div className={styles.patientOverviewGrid}>
        <article className={styles.patientOverviewPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>Current membership</h3>
          </div>
          <div className={styles.patientOverviewBody}>
            <div className={styles.patientSummaryRow}>
              <span>Status</span>
              <strong>{formatStatusLabel(membership.computedStatus)}</strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Assignment status</span>
              <strong>{membership.status ?? "Not set"}</strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Consent</span>
              <strong>{membership.consentStatus ?? "Not set"}</strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Started</span>
              <strong>
                {formatDisplayDate(membership.startsAt, { fallback: "Not set" })}
              </strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Ends</span>
              <strong>
                {formatDisplayDate(membership.endsAt, { fallback: "Not set" })}
              </strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Days remaining</span>
              <strong>
                {membership.daysRemaining === null
                  ? "Not set"
                  : String(membership.daysRemaining)}
              </strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Care team</span>
              <strong>{membership.careTeamId ?? "Not set"}</strong>
            </div>
            <div className={styles.patientSummaryRow}>
              <span>Facility</span>
              <strong>{membership.facilityId ?? "Not set"}</strong>
            </div>
          </div>
        </article>

        <article className={styles.patientOverviewPanel}>
          <div className={styles.patientOverviewHeader}>
            <h3 className={styles.patientOverviewTitle}>Manage membership</h3>
          </div>
          <div className={styles.patientOverviewBody}>
            <label className={styles.carePlanFormGroup}>
              <span className={styles.carePlanFieldLabel}>Action</span>
              <select
                className={styles.carePlanInput}
                onChange={(event) => setAction(event.target.value as ActionType)}
                value={action}
              >
                <option value="extend">Extend membership</option>
                <option value="suspend">Suspend access</option>
                <option value="end">End membership</option>
                <option value="reactivate">Reactivate membership</option>
              </select>
            </label>

            <p className={styles.dataScreenCaption}>{actionSummary}</p>

            {requiresMonths ? (
              <label className={styles.carePlanFormGroup}>
                <span className={styles.carePlanFieldLabel}>Duration</span>
                <select
                  className={styles.carePlanInput}
                  onChange={(event) => setMonths(event.target.value as "3" | "6" | "12")}
                  value={months}
                >
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </select>
              </label>
            ) : null}

            <label className={styles.carePlanFormGroup}>
              <span className={styles.carePlanFieldLabel}>Note</span>
              <textarea
                className={styles.carePlanInput}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a short reason for the membership change"
                rows={4}
                value={note}
              />
            </label>

            <div className={styles.warningActions}>
              <button
                className={styles.buttonPrimarySmall}
                disabled={submitting || note.trim().length < 3}
                onClick={() => void submitAction()}
                type="button"
              >
                {submitting ? "Saving..." : "Save membership action"}
              </button>
            </div>
          </div>
        </article>
      </div>

      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Membership history</span>
          <span className={styles.listHeaderMeta}>
            Recent extend, suspend, end, and reactivation actions
          </span>
        </div>

        {events.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No membership history yet.</p>
          </div>
        ) : (
          <div className={styles.worseningModalList}>
            {events.map((event, index) => (
              <div
                className={styles.worseningModalItem}
                key={`${event.createdAt}-${event.action}-${index}`}
              >
                <strong>{formatActionLabel(event.action)}</strong>
                <span>
                  {formatTransitionLabel(event)}
                  {event.nextEndsAt
                    ? ` · Ends ${formatDisplayDate(event.nextEndsAt)}`
                    : ""}
                </span>
                <span>
                  {formatDisplayDate(event.createdAt)} · {event.actorRole} ·{" "}
                  {event.actorPrincipalId}
                </span>
                <span>Note: {event.note}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
