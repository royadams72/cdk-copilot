"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type InviteStatus =
  | "pending_review"
  | "invited"
  | "activated"
  | "expired"
  | "revoked"
  | "cancelled";

type InviteDisplayStatus =
  | InviteStatus
  | "ending_soon"
  | "inactive"
  | "ended";

type InviteItem = {
  activatedAt: string | null;
  activationCodeMasked: string;
  activationExpiresAt: string;
  canExtend: boolean;
  canResend: boolean;
  canRevoke: boolean;
  careTeamId: string;
  careTeamLabel: string;
  createdAt: string;
  createdByName: string | null;
  createdByPrincipalId: string;
  dateOfBirth: string;
  durationMonths: "3" | "6" | "12";
  displayStatus: InviteDisplayStatus;
  displayStatusLabel: string;
  email: string;
  facilityId: string;
  facilityLabel: string;
  firstName: string;
  id: string;
  invitedAt: string | null;
  lastName: string;
  membershipAccessEndsAt: string | null;
  membershipLifecycleStatus:
    | "active"
    | "endingSoon"
    | "expired"
    | "inactive"
    | "ended"
    | "pending"
    | "unassigned"
    | null;
  membershipStatus: string | null;
  nhsNumber: string | null;
  patientId: string;
  principalId: string;
  status: InviteStatus;
  updatedAt: string;
  updatedByName: string | null;
  updatedByPrincipalId: string;
};

type InvitesResponse = {
  data: {
    items: InviteItem[];
  };
};

type ActionFeedbackState = {
  action: "extend" | "resend" | "revoke";
  activationCode?: string | null;
  invite: InviteItem;
  summary: string;
};

const OPEN_STATUSES = new Set<InviteStatus>(["pending_review", "invited", "expired"]);

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return "No DOB";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No DOB";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDisplayStatusClassName(status: InviteDisplayStatus) {
  switch (status) {
    case "ending_soon":
      return styles.portalStatusPill_expired;
    case "inactive":
    case "ended":
      return styles.portalStatusPill_revoked;
    default:
      return styles[`portalStatusPill_${status}`];
  }
}

function isInviteActivated(item: InviteItem) {
  return item.status === "activated" || Boolean(item.activatedAt);
}

function canResendInvite(item: InviteItem) {
  if (isInviteActivated(item) || item.status === "cancelled") {
    return false;
  }

  return ["pending_review", "invited", "expired", "revoked"].includes(item.status);
}

function canExtendInvite(item: InviteItem) {
  if (isInviteActivated(item) || item.status === "cancelled" || item.status === "revoked") {
    return false;
  }

  return ["pending_review", "invited", "expired"].includes(item.status);
}

function canRevokeInvite(item: InviteItem) {
  if (isInviteActivated(item) || item.status === "cancelled" || item.status === "revoked") {
    return false;
  }

  return ["pending_review", "invited", "expired"].includes(item.status);
}

function readResponseErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const value = body as {
    error?: { message?: string };
    message?: string;
  };

  return value.message || value.error?.message || fallback;
}

export default function PortalPatientInvitesPage() {
  const { session, status } = usePortalAuthSession();
  const [items, setItems] = useState<InviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | InviteStatus | InviteDisplayStatus
  >("all");
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteItem | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedbackState | null>(
    null,
  );

  useEffect(() => {
    if (status !== "authenticated" || !session) {
      return;
    }

    const controller = new AbortController();
    const jwt = session.jwt;

    async function loadInvites() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/portal/patient-invites", {
          headers: getPortalSessionAuthHeaders(jwt),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | InvitesResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(readResponseErrorMessage(body, "Unable to load invites"));
        }

        setItems(body.data.items);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          nextError instanceof Error ? nextError.message : "Unable to load invites",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadInvites();
    return () => controller.abort();
  }, [session, status]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const statusMatch =
        statusFilter === "all"
          ? true
          : statusFilter === "open"
            ? OPEN_STATUSES.has(item.status)
            : item.status === statusFilter || item.displayStatus === statusFilter;

      if (!statusMatch) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        item.firstName,
        item.lastName,
        item.email,
        item.careTeamLabel,
        item.facilityLabel,
        item.nhsNumber ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [items, query, statusFilter]);

  async function reloadInvites() {
    if (!session) {
      return;
    }

    const jwt = session.jwt;
    const response = await fetch("/api/portal/patient-invites", {
      headers: getPortalSessionAuthHeaders(jwt),
    });
    const body = (await response.json().catch(() => null)) as
      | InvitesResponse
      | { error?: { message?: string } }
      | null;

    if (!response.ok || !body || !("data" in body)) {
      throw new Error(readResponseErrorMessage(body, "Unable to refresh invites"));
    }

    setItems(body.data.items);
  }

  async function runAction(invite: InviteItem, action: "extend" | "resend" | "revoke") {
    if (!session) {
      return;
    }

    const jwt = session.jwt;
    setActionPending(invite.id);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/portal/patient-invites/${invite.id}/${action}`,
        {
          headers: {
            ...getPortalSessionAuthHeaders(jwt),
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | {
            data?: {
              activationCode?: string | null;
              activationExpiresAt?: string;
              status?: string;
            };
          }
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        throw new Error(
          readResponseErrorMessage(body, `Unable to ${action} invite`),
        );
      }

      await reloadInvites();
      setActionFeedback({
        action,
        activationCode:
          body && "data" in body ? body.data?.activationCode ?? null : null,
        invite,
        summary:
          action === "resend"
            ? `A fresh activation code was sent to ${invite.email}.`
            : action === "extend"
              ? `The invite expiry for ${invite.email} was extended by 7 days.`
              : `The invite for ${invite.email} was revoked.`,
      });
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : `Unable to ${action} invite`,
      );
    } finally {
      setActionPending(null);
      setRevokeTarget(null);
    }
  }

  if (status === "loading" || loading) {
    return <section className={styles.emptyState}>Loading patient invites...</section>;
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.carePlanFormIntro}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2 className={styles.carePlanFormTitle}>Patient invites</h2>
        <p className={styles.carePlanFormLead}>
          Review invite status, resend activation codes, revoke access, or extend expiry.
        </p>
      </div>

      {actionError ? (
        <section className={styles.emptyState}>
          <p>{actionError}</p>
        </section>
      ) : null}

      <section className={styles.panelSurface}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h3 className={styles.dataScreenTitle}>Invite queue</h3>
            <p className={styles.dataScreenCaption}>
              Showing {filteredItems.length} of {items.length} invite
              {items.length === 1 ? "" : "s"} across all statuses.
            </p>
          </div>

          <div className={styles.portalInviteToolbar}>
            <input
              className={styles.carePlanInput}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, care team, facility, NHS number"
              type="search"
              value={query}
            />
            <select
              className={styles.carePlanInput}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "all" | "open" | InviteStatus | InviteDisplayStatus,
                )
              }
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="open">Open invites</option>
              <option value="pending_review">Pending send</option>
              <option value="invited">Invited</option>
              <option value="activated">Activated access</option>
              <option value="ending_soon">Access ending soon</option>
              <option value="inactive">Suspended access</option>
              <option value="ended">Ended access</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <Link className={styles.buttonPrimarySmall} href="/portal/patients/add">
              Add patients
            </Link>
          </div>
        </div>

        {error ? (
          <div className={styles.emptyState}>
            <h2>Unable to load invites</h2>
            <p>{error}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No invites match this view</h2>
            <p>Try a different status filter or add a new patient batch.</p>
          </div>
        ) : (
          <div className={styles.dataTableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Invite</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expiry</th>
                  <th>Access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {item.firstName} {item.lastName}
                      </strong>
                      <div className={styles.tableSubtleText}>
                        DOB {formatDateOnly(item.dateOfBirth)}
                        {item.nhsNumber ? ` · NHS ${item.nhsNumber}` : ""}
                      </div>
                    </td>
                    <td>
                      <strong>{item.email}</strong>
                      <div className={styles.tableSubtleText}>
                        {item.careTeamLabel} · {item.facilityLabel}
                      </div>
                      <div className={styles.tableSubtleText}>
                        Code ends {item.activationCodeMasked}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.portalStatusPill} ${getDisplayStatusClassName(item.displayStatus)}`}
                      >
                        {item.displayStatusLabel}
                      </span>
                      <div className={styles.tableSubtleText}>
                        {item.activatedAt
                          ? `Activated ${formatDateTime(item.activatedAt)}`
                          : item.invitedAt
                            ? `Sent ${formatDateTime(item.invitedAt)}`
                            : "Not sent yet"}
                      </div>
                      {item.membershipStatus ? (
                        <div className={styles.tableSubtleText}>
                          Membership {item.membershipStatus}
                        </div>
                      ) : null}
                      <div className={styles.tableSubtleText}>
                        Updated {formatDateTime(item.updatedAt)}
                      </div>
                    </td>
                    <td>
                      <strong>
                        {item.createdByName ?? item.createdByPrincipalId}
                      </strong>
                      <div className={styles.tableSubtleText}>
                        {formatDateTime(item.createdAt)}
                      </div>
                    </td>
                    <td>
                      <strong>{formatDateTime(item.activationExpiresAt)}</strong>
                      <div className={styles.tableSubtleText}>
                        {item.status === "expired"
                          ? "Expired invite"
                          : "Activation window"}
                      </div>
                    </td>
                    <td>
                      <strong>{item.durationMonths} months</strong>
                      <div className={styles.tableSubtleText}>
                        {item.membershipAccessEndsAt
                          ? `Access ends ${formatDateTime(item.membershipAccessEndsAt)}`
                          : `Patient ${item.patientId.slice(-6)}`}
                      </div>
                      {item.status === "activated" && item.membershipLifecycleStatus ? (
                        <div className={styles.tableSubtleText}>
                          {item.membershipLifecycleStatus === "endingSoon"
                            ? "Action may be needed soon"
                            : item.membershipLifecycleStatus === "ended" ||
                                item.membershipLifecycleStatus === "expired"
                              ? "Membership is no longer live"
                              : item.membershipLifecycleStatus === "inactive"
                                ? "Membership is suspended"
                                : "Membership is live"}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {(() => {
                        const resendAllowed = canResendInvite(item);
                        const extendAllowed = canExtendInvite(item);
                        const revokeAllowed = canRevokeInvite(item);

                        return (
                      <div className={styles.portalInviteActionGroup}>
                        <button
                          className={styles.buttonSecondarySmall}
                          disabled={!resendAllowed || actionPending === item.id}
                          onClick={() => void runAction(item, "resend")}
                          type="button"
                        >
                          {actionPending === item.id ? "Working..." : "Resend"}
                        </button>
                        <button
                          className={styles.buttonSecondarySmall}
                          disabled={!extendAllowed || actionPending === item.id}
                          onClick={() => void runAction(item, "extend")}
                          type="button"
                        >
                          Extend 7 days
                        </button>
                        <button
                          className={styles.buttonGhost}
                          disabled={!revokeAllowed || actionPending === item.id}
                          onClick={() => setRevokeTarget(item)}
                          type="button"
                        >
                          Revoke
                        </button>
                      </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {revokeTarget ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setRevokeTarget(null)}
        >
          <div
            className={`${styles.modalCard} ${styles.modalWarning}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Revoke invite</h3>
            <p className={styles.modalCopy}>
              Revoke the invite for {revokeTarget.firstName} {revokeTarget.lastName}?
              The activation code will stop working.
            </p>
            <div className={styles.warningActions}>
              <button
                className={styles.buttonSecondarySmall}
                onClick={() => setRevokeTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.buttonPrimarySmall}
                disabled={actionPending === revokeTarget.id}
                onClick={() => void runAction(revokeTarget, "revoke")}
                type="button"
              >
                {actionPending === revokeTarget.id ? "Revoking..." : "Confirm revoke"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionFeedback ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setActionFeedback(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Invite updated</h3>
            <p className={styles.modalCopy}>{actionFeedback.summary}</p>
            {actionFeedback.activationCode ? (
              <div className={styles.portalFormSectionList}>
                <div className={styles.portalFormSectionItem}>
                  <strong>{actionFeedback.invite.email}</strong>
                  <span>Activation code: {actionFeedback.activationCode}</span>
                </div>
              </div>
            ) : null}
            <div className={styles.warningActions}>
              <button
                className={styles.buttonPrimarySmall}
                onClick={() => setActionFeedback(null)}
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
