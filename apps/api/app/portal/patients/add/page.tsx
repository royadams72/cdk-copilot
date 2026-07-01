"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type IntakeDuration = "3" | "6" | "12";

type IntakeRow = {
  dateOfBirth: string;
  durationMonths: IntakeDuration;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  nhsNumber: string;
};

type ValidationIssue = {
  code: string;
  message: string;
};

type ValidatedRow = {
  rowIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  durationMonths: IntakeDuration;
  nhsNumber: string | null;
  issues: ValidationIssue[];
  isValid: boolean;
};

type ValidationResponse = {
  data: {
    batch: {
      careTeamId: string;
      facilityId: string;
      rowCount: number;
      validRows: number;
      invalidRows: number;
    };
    rows: ValidatedRow[];
  };
};

type ValidationModalState =
  | {
      kind: "invalid";
      invalidRows: ValidatedRow[];
      summary: string;
    }
  | {
      kind: "confirm";
      summary: string;
      validRows: ValidatedRow[];
    }
  | {
      kind: "created";
      devInvites?: Array<{
        activationCode: string;
        email: string;
      }>;
      failedCount: number;
      sentCount: number;
      summary: string;
    };

type CreateBatchResponse = {
  data: {
    batchId: string;
    createdCount: number;
    devInvites?: Array<{
      activationCode: string;
      email: string;
    }>;
    failedCount: number;
    failedDeliveries?: Array<{
      email: string;
      message: string;
    }>;
    sentCount: number;
    status: string;
  };
};

const DEFAULT_ROW_COUNT = 5;
const DURATION_OPTIONS: IntakeDuration[] = ["3", "6", "12"];

function createEmptyRow(index: number): IntakeRow {
  return {
    dateOfBirth: "",
    durationMonths: "6",
    email: "",
    firstName: "",
    id: `row_${index}_${Math.random().toString(36).slice(2, 8)}`,
    lastName: "",
    nhsNumber: "",
  };
}

export default function PortalAddPatientPage() {
  const { session, status } = usePortalAuthSession();
  const [careTeamId, setCareTeamId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [rows, setRows] = useState<IntakeRow[]>(
    Array.from({ length: DEFAULT_ROW_COUNT }, (_, index) =>
      createEmptyRow(index),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ValidationModalState | null>(null);

  const careTeamOptions = useMemo(
    () =>
      session?.user.careTeams?.length
        ? session.user.careTeams
        : (session?.user.careTeamIds ?? []).map((id) => ({ id, label: id })),
    [session?.user.careTeamIds, session?.user.careTeams],
  );
  const facilityOptions = useMemo(
    () =>
      session?.user.facilities?.length
        ? session.user.facilities
        : (session?.user.facilityIds ?? []).map((id) => ({ id, label: id })),
    [session?.user.facilities, session?.user.facilityIds],
  );

  useEffect(() => {
    if (!careTeamId && careTeamOptions.length === 1) {
      setCareTeamId(careTeamOptions[0].id);
    }
  }, [careTeamId, careTeamOptions]);

  useEffect(() => {
    if (!facilityId && facilityOptions.length === 1) {
      setFacilityId(facilityOptions[0].id);
    }
  }, [facilityId, facilityOptions]);

  const nonEmptyRows = rows.filter(
    (row) =>
      row.firstName.trim() ||
      row.lastName.trim() ||
      row.email.trim() ||
      row.dateOfBirth.trim() ||
      row.nhsNumber.trim(),
  );

  const canValidate = Boolean(
    careTeamId.trim() && facilityId.trim() && nonEmptyRows.length > 0,
    );

  function updateRow(id: string, key: keyof Omit<IntakeRow, "id">, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
    setModalState(null);
  }

  function addRow() {
    setRows((current) => [...current, createEmptyRow(current.length)]);
    setModalState(null);
  }

  function removeRow(id: string) {
    setRows((current) =>
      current.length > 1 ? current.filter((row) => row.id !== id) : current,
    );
    setModalState(null);
  }

  function resetForm() {
    setRows(
      Array.from({ length: DEFAULT_ROW_COUNT }, (_, index) => createEmptyRow(index)),
    );
    setError(null);
    setModalState(null);
  }

  async function validateBatch() {
    if (!session || !canValidate || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setModalState(null);

    try {
      const response = await fetch("/api/portal/patient-invites/validate-batch", {
        body: JSON.stringify({
          careTeamId,
          facilityId,
          rows: nonEmptyRows.map((row) => ({
            dateOfBirth: row.dateOfBirth,
            durationMonths: row.durationMonths,
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            nhsNumber: row.nhsNumber.trim() || undefined,
          })),
        }),
        headers: {
          ...getPortalSessionAuthHeaders(session.jwt),
          "content-type": "application/json",
        },
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as
        | ValidationResponse
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to validate patient batch",
        );
      }

      if (body.data.batch.invalidRows > 0) {
        setModalState({
          invalidRows: body.data.rows.filter((row) => row.issues.length > 0),
          kind: "invalid",
          summary: `${body.data.batch.invalidRows} invalid row${body.data.batch.invalidRows === 1 ? "" : "s"} found.`,
        });
        return;
      }

      setModalState({
        kind: "confirm",
        summary: `${body.data.batch.validRows} row${body.data.batch.validRows === 1 ? "" : "s"} validated and ready for invite creation.`,
        validRows: body.data.rows,
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to validate patient batch",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function createInviteBatch() {
    if (!session || !canValidate || creatingBatch) {
      return;
    }

    setCreatingBatch(true);
    setError(null);

    try {
      const response = await fetch("/api/portal/patient-invites/create-batch", {
        body: JSON.stringify({
          careTeamId,
          facilityId,
          rows: nonEmptyRows.map((row) => ({
            dateOfBirth: row.dateOfBirth,
            durationMonths: row.durationMonths,
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            nhsNumber: row.nhsNumber.trim() || undefined,
          })),
        }),
        headers: {
          ...getPortalSessionAuthHeaders(session.jwt),
          "content-type": "application/json",
        },
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as
        | CreateBatchResponse
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to create invite batch",
        );
      }

      setModalState({
        kind: "created",
        devInvites: body.data.devInvites,
        failedCount: body.data.failedCount,
        sentCount: body.data.sentCount,
        summary:
          body.data.failedCount > 0
            ? `${body.data.sentCount} invite${body.data.sentCount === 1 ? "" : "s"} sent, ${body.data.failedCount} failed.`
            : `${body.data.sentCount} invite${body.data.sentCount === 1 ? "" : "s"} created and sent.`,
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to create invite batch",
      );
    } finally {
      setCreatingBatch(false);
    }
  }

  if (status === "loading") {
    return <section className={styles.emptyState}>Loading patient intake...</section>;
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.carePlanFormIntro}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2 className={styles.carePlanFormTitle}>Invite Patients</h2>
        <p className={styles.carePlanFormLead}>
          Add a small batch, validate the rows, then review before invite creation.
        </p>
      </div>

      <section className={styles.portalFormShellWide}>
        <div className={styles.portalFormGrid}>
          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="patient-care-team">
              Care team
            </label>
            {careTeamOptions.length ? (
              <select
                className={styles.carePlanInput}
                id="patient-care-team"
                onChange={(event) => setCareTeamId(event.target.value)}
                value={careTeamId}
              >
                <option value="">Select care team</option>
                {careTeamOptions.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={styles.carePlanInput}
                id="patient-care-team"
                onChange={(event) => setCareTeamId(event.target.value)}
                placeholder="Enter care team id"
                value={careTeamId}
              />
            )}
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="patient-facility">
              Facility
            </label>
            {facilityOptions.length ? (
              <select
                className={styles.carePlanInput}
                id="patient-facility"
                onChange={(event) => setFacilityId(event.target.value)}
                value={facilityId}
              >
                <option value="">Select facility</option>
                {facilityOptions.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={styles.carePlanInput}
                id="patient-facility"
                onChange={(event) => setFacilityId(event.target.value)}
                placeholder="Enter facility id"
                value={facilityId}
              />
            )}
          </div>
        </div>
      </section>

      <section className={styles.portalResultCard}>
        <div className={styles.portalResultHeader}>
          <h3 className={styles.carePlanPanelTitle}>Patient rows</h3>
          <p className={styles.dataScreenCaption}>
            First name, last name, email, date of birth, access duration, and optional NHS number.
          </p>
        </div>

        <div className={styles.portalIntakeRows}>
          {rows.map((row, index) => (
            <div className={styles.portalIntakeRow} key={row.id}>
              <input
                className={styles.carePlanInput}
                onChange={(event) => updateRow(row.id, "firstName", event.target.value)}
                placeholder="First name"
                value={row.firstName}
              />
              <input
                className={styles.carePlanInput}
                onChange={(event) => updateRow(row.id, "lastName", event.target.value)}
                placeholder="Last name"
                value={row.lastName}
              />
              <input
                className={styles.carePlanInput}
                onChange={(event) => updateRow(row.id, "email", event.target.value)}
                placeholder="Email"
                type="email"
                value={row.email}
              />
              <input
                className={styles.carePlanInput}
                onChange={(event) => updateRow(row.id, "dateOfBirth", event.target.value)}
                type="date"
                value={row.dateOfBirth}
              />
              <select
                className={styles.carePlanInput}
                onChange={(event) =>
                  updateRow(row.id, "durationMonths", event.target.value)
                }
                value={row.durationMonths}
              >
                {DURATION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} months
                  </option>
                ))}
              </select>
              <input
                className={styles.carePlanInput}
                onChange={(event) => updateRow(row.id, "nhsNumber", event.target.value)}
                placeholder="NHS number (optional)"
                value={row.nhsNumber}
              />
              <button
                className={styles.buttonSecondarySmall}
                onClick={() => removeRow(row.id)}
                type="button"
              >
                Remove
              </button>
              <span className={styles.portalIntakeRowNumber}>Row {index + 1}</span>
            </div>
          ))}
        </div>

        <div className={styles.portalButtonRow}>
          <button
            className={styles.buttonSecondarySmall}
            onClick={addRow}
            type="button"
          >
            Add row
          </button>
          <button
            className={styles.buttonPrimarySmall}
            disabled={!canValidate || submitting}
            onClick={validateBatch}
            type="button"
          >
            {submitting ? "Validating..." : "Validate batch"}
          </button>
        </div>
      </section>

      {error ? (
        <div className={styles.warningModalBackdrop}>
          <div
            className={`${styles.modalCard} ${styles.modalWarning}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Unable to process invite batch</h3>
            <p className={styles.modalCopy}>{error}</p>
            <div className={styles.warningActions}>
              <button
                className={styles.buttonPrimarySmall}
                onClick={() => setError(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalState?.kind === "invalid" ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setModalState(null)}
        >
          <div
            className={`${styles.modalCard} ${styles.modalWarning}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Rows need attention</h3>
            <p className={styles.modalCopy}>
              {modalState.summary} Only the invalid rows are shown below.
            </p>
            <div className={styles.portalFormSectionList}>
              {modalState.invalidRows.map((row) => (
                <div
                  className={styles.portalFormSectionItem}
                  key={`${row.rowIndex}-${row.email}-${row.dateOfBirth}`}
                >
                  <strong>
                    Row {row.rowIndex + 1}: {row.firstName || "Missing first name"}{" "}
                    {row.lastName || "Missing last name"}
                  </strong>
                  <span>
                    {[
                      row.email || "No email",
                      row.dateOfBirth || "No DOB",
                      `${row.durationMonths} months`,
                    ].join(" · ")}
                  </span>
                  <div className={styles.portalValidationIssueList}>
                    {row.issues.map((issue, issueIndex) => (
                      <span
                        className={styles.portalValidationIssue}
                        key={`${issue.code}-${issueIndex}`}
                      >
                        {issue.message}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.warningActions}>
              <button
                className={styles.buttonPrimarySmall}
                onClick={() => setModalState(null)}
                type="button"
              >
                Back to rows
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalState?.kind === "confirm" ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setModalState(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Review invite batch</h3>
            <p className={styles.modalCopy}>{modalState.summary}</p>
            <div className={styles.portalFormSectionList}>
              {modalState.validRows.map((row) => (
                <div
                  className={styles.portalFormSectionItem}
                  key={`${row.rowIndex}-${row.email}-${row.dateOfBirth}`}
                >
                  <strong>
                    Row {row.rowIndex + 1}: {row.firstName} {row.lastName}
                  </strong>
                  <span>
                    {[row.email, row.dateOfBirth, `${row.durationMonths} months`].join(
                      " · ",
                    )}
                  </span>
                  <span className={styles.portalValidationSuccess}>
                    Ready to create.
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.warningActions}>
              <button
                className={styles.buttonSecondarySmall}
                onClick={() => setModalState(null)}
                type="button"
              >
                Close
              </button>
              <button
                className={styles.buttonPrimarySmall}
                disabled={creatingBatch}
                onClick={() => void createInviteBatch()}
                type="button"
              >
                {creatingBatch ? "Creating..." : "Create and send invites"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalState?.kind === "created" ? (
        <div
          className={styles.warningModalBackdrop}
          onClick={() => setModalState(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Invite batch processed</h3>
            <p className={styles.modalCopy}>{modalState.summary}</p>
            {modalState.devInvites?.length ? (
              <div className={styles.portalFormSectionList}>
                {modalState.devInvites.map((invite) => (
                  <div
                    className={styles.portalFormSectionItem}
                    key={`${invite.email}-${invite.activationCode}`}
                  >
                    <strong>{invite.email}</strong>
                    <span>Activation code: {invite.activationCode}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.warningActions}>
              <button
                className={styles.buttonSecondarySmall}
                onClick={() => setModalState(null)}
                type="button"
              >
                Close
              </button>
              <button
                className={styles.buttonPrimarySmall}
                onClick={resetForm}
                type="button"
              >
                Add more patients
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
