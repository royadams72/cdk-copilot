"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import { formatPatientLifecycleStatusLabel } from "@/apps/api/lib/portal/patientLifecycle";
import type {
  PortalPatientMembershipResponse,
  PortalPatientMembershipSnapshot,
  PortalPatientMembershipTimelineRow,
} from "@/apps/api/lib/portal/patientMembership";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type MembershipResponse = {
  data: PortalPatientMembershipResponse;
};

type ActionType = "extend" | "suspend" | "end" | "reactivate";
type ActionSelectValue = "" | ActionType;
type DurationSelectValue = "" | "3" | "6" | "12";
type ActionGuardState = {
  action: ActionType;
  message: string;
  title: string;
} | null;
type FormErrors = {
  action?: string;
  months?: string;
  note?: string;
};

function formatStatusLabel(status: PortalPatientMembershipSnapshot["computedStatus"]) {
  return formatPatientLifecycleStatusLabel(status);
}

function formatActionLabel(action: PortalPatientMembershipTimelineRow["action"]) {
  switch (action) {
    case "extended":
      return "Extended";
    case "suspended":
      return "Suspended";
    case "ended":
      return "Ended";
    case "reactivated":
      return "Reactivated";
    case "invite_created":
      return "Invite created";
    case "invite_sent":
      return "Invite sent";
    case "invite_activated":
      return "Invite activated";
    case "invite_expired":
      return "Invite expired";
    case "invite_revoked":
      return "Invite revoked";
    case "invite_cancelled":
      return "Invite cancelled";
  }
}

export default function PortalPatientMembershipPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [patientName, setPatientName] = useState("Patient");
  const [membership, setMembership] = useState<PortalPatientMembershipSnapshot | null>(null);
  const [events, setEvents] = useState<PortalPatientMembershipTimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ActionSelectValue>("");
  const [actionGuard, setActionGuard] = useState<ActionGuardState>(null);
  const [months, setMonths] = useState<DurationSelectValue>("");
  const [note, setNote] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const requiresMonths = action === "extend" || action === "reactivate";

  function getInvalidActionMessage(
    currentStatus: PortalPatientMembershipSnapshot["computedStatus"],
    nextAction: ActionType,
  ) {
    switch (nextAction) {
      case "extend":
        if (currentStatus === "inactive") {
          return "This membership is suspended. Use Reactivate membership instead of Extend membership.";
        }
        if (
          currentStatus === "ended" ||
          currentStatus === "expired" ||
          currentStatus === "pending" ||
          currentStatus === "unassigned"
        ) {
          return "Extend membership only makes sense for an active membership that is still running.";
        }
        return null;
      case "suspend":
        if (
          currentStatus === "inactive" ||
          currentStatus === "ended" ||
          currentStatus === "expired" ||
          currentStatus === "pending" ||
          currentStatus === "unassigned"
        ) {
          return "Only an active membership can be suspended.";
        }
        return null;
      case "end":
        if (currentStatus === "ended" || currentStatus === "unassigned") {
          return "There is no live membership here to end.";
        }
        return null;
      case "reactivate":
        if (currentStatus === "active" || currentStatus === "endingSoon") {
          return "This membership is already active. Use Extend membership if you want to add more time.";
        }
        if (currentStatus === "pending" || currentStatus === "unassigned") {
          return "This membership cannot be reactivated from its current state.";
        }
        return null;
    }
  }

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
    if (!action) {
      return "Select a membership action before saving.";
    }

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

  function validateForm() {
    const nextErrors: FormErrors = {};

    if (!action) {
      nextErrors.action = "Select a membership action.";
    }

    if (requiresMonths && !months) {
      nextErrors.months = "Select a duration.";
    }

    if (note.trim().length < 3) {
      nextErrors.note = "Enter a short note of at least 3 characters.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submitAction() {
    if (!session || !params.patientId) {
      return;
    }

    if (!validateForm() || !action) {
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
            ...(requiresMonths && months ? { months } : {}),
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
      setAction("");
      setMonths("");
      setNote("");
      setFormErrors({});
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
                className={`${styles.carePlanInput} ${
                  formErrors.action ? styles.portalFieldInputError : ""
                }`}
                onChange={(event) => {
                  const nextAction = event.target.value as ActionSelectValue;

                  setFormErrors((current) => ({ ...current, action: undefined }));

                  if (!nextAction) {
                    setAction("");
                    setMonths("");
                    return;
                  }

                  const invalidMessage = getInvalidActionMessage(
                    membership.computedStatus,
                    nextAction,
                  );

                  if (invalidMessage) {
                    setActionGuard({
                      action: nextAction,
                      message: invalidMessage,
                      title: "This membership action is blocked",
                    });
                    return;
                  }

                  setAction(nextAction);
                  if (nextAction !== "extend" && nextAction !== "reactivate") {
                    setMonths("");
                    setFormErrors((current) => ({
                      ...current,
                      months: undefined,
                    }));
                  }
                }}
                value={action}
              >
                <option value="">Action</option>
                <option value="extend">Extend membership</option>
                <option value="suspend">Suspend access</option>
                <option value="end">End membership</option>
                <option value="reactivate">Reactivate membership</option>
              </select>
              {formErrors.action ? (
                <span className={styles.portalFieldError}>{formErrors.action}</span>
              ) : null}
            </label>

            <p className={styles.dataScreenCaption}>{actionSummary}</p>

            {requiresMonths ? (
              <label className={styles.carePlanFormGroup}>
                <span className={styles.carePlanFieldLabel}>Duration</span>
                <select
                  className={`${styles.carePlanInput} ${
                    formErrors.months ? styles.portalFieldInputError : ""
                  }`}
                  onChange={(event) => {
                    setMonths(event.target.value as DurationSelectValue);
                    setFormErrors((current) => ({
                      ...current,
                      months: undefined,
                    }));
                  }}
                  value={months}
                >
                  <option value="">Duration</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </select>
                {formErrors.months ? (
                  <span className={styles.portalFieldError}>{formErrors.months}</span>
                ) : null}
              </label>
            ) : null}

            <label className={styles.carePlanFormGroup}>
              <span className={styles.carePlanFieldLabel}>Note</span>
              <textarea
                className={`${styles.carePlanInput} ${
                  formErrors.note ? styles.portalFieldInputError : ""
                }`}
                onChange={(event) => {
                  setNote(event.target.value);
                  setFormErrors((current) => ({ ...current, note: undefined }));
                }}
                placeholder="Add a short reason for the membership change"
                rows={4}
                value={note}
              />
              {formErrors.note ? (
                <span className={styles.portalFieldError}>{formErrors.note}</span>
              ) : null}
            </label>

            <div className={styles.warningActions}>
              <button
                className={styles.buttonPrimarySmall}
                disabled={submitting}
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
            Invite and membership activity for this patient
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
                <span>{event.summary}</span>
                <span>{event.statusDetail}</span>
                <span>
                  {formatDisplayDate(event.createdAt)} · {event.actorRole}
                  {event.actorName || event.actorPrincipalId
                    ? ` · ${event.actorName ?? event.actorPrincipalId}`
                    : ""}
                </span>
                {event.note ? <span>Note: {event.note}</span> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {actionGuard ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setActionGuard(null)}
        >
          <div
            className={`${styles.modalCard} ${styles.modalWarning}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>{actionGuard.title}</h3>
            <p className={styles.modalCopy}>{actionGuard.message}</p>
            <div className={styles.warningActions}>
              <button
                className={styles.buttonSecondarySmall}
                onClick={() => setActionGuard(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
