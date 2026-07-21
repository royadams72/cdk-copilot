"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import { PortalDialog } from "@/apps/api/app/portal/components/PortalDialog";
import styles from "@/apps/api/app/portal/portal.module.css";
import { readResponseMessage } from "@/apps/api/lib/http/response-message";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import { focusFirstInvalidField as focusFirstInvalidFormField } from "@/apps/api/lib/portal/focusFirstInvalidField";

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

type IntakeFieldKey = keyof Omit<IntakeRow, "id">;

type RowFieldErrors = Partial<Record<IntakeFieldKey, string>>;
type ExtendedRowFieldErrors = RowFieldErrors & { row?: string };

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
      failedDeliveries?: Array<{
        email: string;
        message: string;
      }>;
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

const CSV_TEMPLATE_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "dateOfBirth",
  "durationMonths",
  "nhsNumber",
] as const;

const CSV_TEMPLATE_ROWS = [
  ["Jane", "Doe", "jane.doe@example.com", "1980-04-15", "6", "9434765919"],
  ["John", "Smith", "john.smith@example.com", "1972-11-09", "12", ""],
];

function escapeCsvValue(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function buildCsvTemplate() {
  return [
    CSV_TEMPLATE_HEADERS.join(","),
    ...CSV_TEMPLATE_ROWS.map((row) => row.map(escapeCsvValue).join(",")),
  ].join("\n");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvRows(source: string) {
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("The CSV file must include a header row and at least one patient row.");
  }

  const headers = parseCsvLine(lines[0]);
  const expectedHeaders = [...CSV_TEMPLATE_HEADERS];
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(
      `Use the template headers exactly: ${expectedHeaders.join(", ")}`,
    );
  }

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      expectedHeaders.map((header, valueIndex) => [header, values[valueIndex] ?? ""]),
    ) as Record<(typeof CSV_TEMPLATE_HEADERS)[number], string>;

    return {
      dateOfBirth: row.dateOfBirth?.trim() ?? "",
      durationMonths:
        row.durationMonths === "3" ||
        row.durationMonths === "6" ||
        row.durationMonths === "12"
          ? row.durationMonths
          : "6",
      email: row.email?.trim() ?? "",
      firstName: row.firstName?.trim() ?? "",
      id: `imported_${index}_${Math.random().toString(36).slice(2, 8)}`,
      lastName: row.lastName?.trim() ?? "",
      nhsNumber: row.nhsNumber?.trim() ?? "",
    } satisfies IntakeRow;
  });
}

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidIsoDate(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function isValidNhsNumber(value: string) {
  const digits = value.replace(/\s+/g, "");
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }

  const numbers = digits.split("").map(Number);
  const checksum =
    numbers
      .slice(0, 9)
      .reduce((sum, digit, index) => sum + digit * (10 - index), 0) % 11;
  const checkDigit = 11 - checksum;
  const expected = checkDigit === 11 ? 0 : checkDigit;

  return checkDigit !== 10 && expected === numbers[9];
}

function isRowEmpty(row: IntakeRow) {
  return !(
    row.firstName.trim() ||
    row.lastName.trim() ||
    row.email.trim() ||
    row.dateOfBirth.trim() ||
    row.nhsNumber.trim()
  );
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
  const [rowErrors, setRowErrors] = useState<Record<string, RowFieldErrors>>({});
  const [careTeamError, setCareTeamError] = useState<string | null>(null);
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const careTeamOptions = useMemo(
    () =>
      session?.user.careTeams?.length
        ? session.user.careTeams
        : (session?.user.careTeamIds ?? []).map((id) => ({
            facilityId: null,
            id,
            label: id,
          })),
    [session?.user.careTeamIds, session?.user.careTeams],
  );
  const facilityOptions = useMemo(
    () => {
      const scopedFacilities =
        session?.user.facilities?.length
          ? session.user.facilities
          : (session?.user.facilityIds ?? []).map((id) => ({ id, label: id }));

      const selectedCareTeam = careTeamOptions.find((item) => item.id === careTeamId);
      if (!selectedCareTeam?.facilityId) {
        return scopedFacilities;
      }

      return scopedFacilities.filter((item) => item.id === selectedCareTeam.facilityId);
    },
    [careTeamId, careTeamOptions, session?.user.facilities, session?.user.facilityIds],
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

  useEffect(() => {
    if (!facilityId) {
      return;
    }

    if (!facilityOptions.some((item) => item.id === facilityId)) {
      setFacilityId("");
    }
  }, [facilityId, facilityOptions]);

  const nonEmptyRows = rows.filter((row) => !isRowEmpty(row));

  const canValidate = Boolean(
    careTeamId.trim() && facilityId.trim() && nonEmptyRows.length > 0,
  );

  function getFieldRefKey(rowId: string, field: IntakeFieldKey) {
    return `${rowId}:${field}`;
  }

  function setFieldRef(
    rowId: string,
    field: IntakeFieldKey,
    element: HTMLInputElement | HTMLSelectElement | null,
  ) {
    fieldRefs.current[getFieldRefKey(rowId, field)] = element;
  }

  function getClientValidationErrors(currentRows: IntakeRow[]) {
    const nextErrors: Record<string, ExtendedRowFieldErrors> = {};
    const emailCounts = new Map<string, number>();
    const patientKeyCounts = new Map<string, number>();

    for (const row of currentRows) {
      if (isRowEmpty(row)) continue;
      const email = row.email.trim().toLowerCase();
      if (email) {
        emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
      }
      const patientKey = [
        row.firstName.trim().toLowerCase(),
        row.lastName.trim().toLowerCase(),
        row.dateOfBirth.trim(),
      ].join("|");
      if (patientKey !== "||") {
        patientKeyCounts.set(patientKey, (patientKeyCounts.get(patientKey) ?? 0) + 1);
      }
    }

    for (const row of currentRows) {
      if (isRowEmpty(row)) continue;

      const errors: ExtendedRowFieldErrors = {};
      const firstName = row.firstName.trim();
      const lastName = row.lastName.trim();
      const email = row.email.trim().toLowerCase();
      const dateOfBirth = row.dateOfBirth.trim();
      const nhsNumber = row.nhsNumber.trim();

      if (!firstName) errors.firstName = "Enter first name";
      if (!lastName) errors.lastName = "Enter last name";
      if (!email) {
        errors.email = "Enter email";
      } else if (!isValidEmail(email)) {
        errors.email = "Enter a valid email";
      } else if ((emailCounts.get(email) ?? 0) > 1) {
        errors.email = "This email appears more than once in the batch";
      }
      if (!dateOfBirth) {
        errors.dateOfBirth = "Enter date of birth";
      } else if (!isValidIsoDate(dateOfBirth)) {
        errors.dateOfBirth = "Enter a valid date of birth";
      }
      const patientKey = [
        firstName.toLowerCase(),
        lastName.toLowerCase(),
        dateOfBirth,
      ].join("|");
      if (patientKey !== "||" && (patientKeyCounts.get(patientKey) ?? 0) > 1) {
        errors.row = "This patient appears more than once in the batch";
      }
      if (!row.durationMonths) {
        errors.durationMonths = "Select access duration";
      }
      if (nhsNumber && !isValidNhsNumber(nhsNumber)) {
        errors.nhsNumber = "Enter a valid NHS number";
      }

      if (Object.keys(errors).length > 0) {
        nextErrors[row.id] = errors;
      }
    }

    return nextErrors;
  }

  function focusFirstInvalidPatientInviteField(args: {
    nextCareTeamError: string | null;
    nextFacilityError: string | null;
    nextRowErrors: Record<string, RowFieldErrors>;
    currentRows: IntakeRow[];
  }) {
    const invalidTargets: Array<HTMLElement | null> = [
      args.nextCareTeamError
        ? document.getElementById("patient-care-team")
        : null,
      args.nextFacilityError
        ? document.getElementById("patient-facility")
        : null,
    ];

    const fieldOrder: IntakeFieldKey[] = [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "durationMonths",
      "nhsNumber",
    ];

    for (const row of args.currentRows) {
      const errors = args.nextRowErrors[row.id];
      if (!errors) continue;
      for (const field of fieldOrder) {
        if (!errors[field]) continue;
        invalidTargets.push(
          fieldRefs.current[getFieldRefKey(row.id, field)] ?? null,
        );
      }
    }

    focusFirstInvalidFormField(invalidTargets);
  }

  function validateClient(currentRows: IntakeRow[]) {
    const nextCareTeamError = careTeamId.trim() ? null : "Select care team";
    const nextFacilityError = facilityId.trim() ? null : "Select facility";
    const nextRowErrors = getClientValidationErrors(currentRows);

    setCareTeamError(nextCareTeamError);
    setFacilityError(nextFacilityError);
    setRowErrors(nextRowErrors);

    const hasErrors =
      Boolean(nextCareTeamError) ||
      Boolean(nextFacilityError) ||
      Object.keys(nextRowErrors).length > 0;

    if (hasErrors) {
      focusFirstInvalidPatientInviteField({
        currentRows,
        nextCareTeamError,
        nextFacilityError,
        nextRowErrors,
      });
    }

    return !hasErrors;
  }

  function updateRow(id: string, key: keyof Omit<IntakeRow, "id">, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
    setRowErrors((current) => {
      if (!current[id]?.[key]) return current;
      return {
        ...current,
        [id]: {
          ...current[id],
          [key]: undefined,
        },
      };
    });
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
    setRowErrors({});
    setCareTeamError(null);
    setFacilityError(null);
    setError(null);
    setModalState(null);
  }

  function downloadTemplate() {
    const blob = new Blob([buildCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ckd-copilot-patient-invite-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function importCsvFile(file: File) {
    const text = await file.text();
    const importedRows = parseCsvRows(text);
    if (!importedRows.length) {
      throw new Error("The CSV file did not contain any patient rows.");
    }

    setRows([
      ...importedRows,
      ...Array.from(
        { length: Math.max(0, DEFAULT_ROW_COUNT - importedRows.length) },
        (_, index) => createEmptyRow(importedRows.length + index),
      ),
    ]);
    setRowErrors({});
    setError(null);
    setModalState(null);
  }

  async function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await importCsvFile(file);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to import the CSV file",
      );
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  }

  function handleRowBlur() {
    setRowErrors(getClientValidationErrors(rows));
  }

  async function validateBatch() {
    if (!session || submitting) {
      return;
    }

    if (!validateClient(rows)) {
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
        throw new Error(readResponseMessage(body, "Unable to validate patient batch"));
      }

      if (body.data.batch.invalidRows > 0) {
        const nextRowErrors: Record<string, ExtendedRowFieldErrors> = {};
        for (const invalidRow of body.data.rows.filter((row) => row.issues.length > 0)) {
          const currentRow = nonEmptyRows[invalidRow.rowIndex];
          if (!currentRow) continue;
          const mapped: ExtendedRowFieldErrors = {};
          for (const issue of invalidRow.issues) {
            if (
              issue.code === "missing_first_name" &&
              !mapped.firstName
            ) mapped.firstName = issue.message;
            if (
              issue.code === "missing_last_name" &&
              !mapped.lastName
            ) mapped.lastName = issue.message;
            if (
              ["missing_email", "invalid_email", "duplicate_email_in_batch", "patient_record_exists", "patient_already_active", "pending_invite_exists"].includes(issue.code) &&
              !mapped.email
            ) mapped.email = issue.message;
            if (
              ["missing_date_of_birth", "invalid_date_of_birth"].includes(issue.code) &&
              !mapped.dateOfBirth
            ) mapped.dateOfBirth = issue.message;
            if (issue.code === "duplicate_patient_in_batch" && !mapped.row) {
              mapped.row = issue.message;
            }
            if (
              ["missing_duration", "invalid_duration"].includes(issue.code) &&
              !mapped.durationMonths
            ) mapped.durationMonths = issue.message;
            if (issue.code === "invalid_nhs_number" && !mapped.nhsNumber) {
              mapped.nhsNumber = issue.message;
            }
          }
          if (Object.keys(mapped).length > 0) {
            nextRowErrors[currentRow.id] = mapped;
          }
        }
        setRowErrors((current) => ({ ...current, ...nextRowErrors }));
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
    if (!session || creatingBatch) {
      return;
    }

    if (!validateClient(rows)) {
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
        | {
            error?: {
              code?: string;
              data?: ValidationResponse["data"];
              message?: string;
            };
          }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        if (
          response.status === 409 &&
          body &&
          "error" in body &&
          body.error?.code === "invite_batch_requires_revalidation" &&
          body.error.data
        ) {
          const invalidRows = body.error.data.rows.filter((row) => row.issues.length > 0);
          const nextRowErrors: Record<string, ExtendedRowFieldErrors> = {};
          for (const invalidRow of invalidRows) {
            const currentRow = nonEmptyRows[invalidRow.rowIndex];
            if (!currentRow) continue;
            const mapped: ExtendedRowFieldErrors = {};
            for (const issue of invalidRow.issues) {
              if (
                ["missing_email", "invalid_email", "duplicate_email_in_batch", "patient_record_exists", "patient_already_active", "pending_invite_exists"].includes(issue.code) &&
                !mapped.email
              ) mapped.email = issue.message;
              if (
                ["missing_date_of_birth", "invalid_date_of_birth"].includes(issue.code) &&
                !mapped.dateOfBirth
              ) mapped.dateOfBirth = issue.message;
              if (issue.code === "duplicate_patient_in_batch" && !mapped.row) {
                mapped.row = issue.message;
              }
            }
            if (Object.keys(mapped).length > 0) {
              nextRowErrors[currentRow.id] = mapped;
            }
          }
          setRowErrors((current) => ({ ...current, ...nextRowErrors }));
          setModalState({
            invalidRows,
            kind: "invalid",
            summary: "One or more rows changed since validation. Review the highlighted rows and validate again.",
          });
          return;
        }
        throw new Error(readResponseMessage(body, "Unable to create invite batch"));
      }

      setModalState({
        kind: "created",
        devInvites: body.data.devInvites,
        failedCount: body.data.failedCount,
        failedDeliveries: body.data.failedDeliveries,
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
    return <PortalLoadingState label="Loading patient intake..." />;
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.carePlanFormIntro}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h1 className={styles.carePlanFormTitle}>Invite Patients</h1>
        <p className={styles.carePlanFormLead}>
          Add a small batch, validate the rows, then review before invite creation.
        </p>
        <Link className={styles.inlineLink} href="/portal/patients/invites">
          View invites
        </Link>
      </div>

      <section className={styles.portalFormShellWide}>
        <div className={styles.portalFormGrid}>
          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="patient-care-team">
              Care team
            </label>
            {careTeamOptions.length ? (
              <select
                className={`${styles.carePlanInput} ${careTeamError ? styles.portalFieldInputError : ""}`}
                id="patient-care-team"
                onChange={(event) => {
                  setCareTeamId(event.target.value);
                  setCareTeamError(null);
                  setFacilityError(null);
                }}
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
                aria-invalid={Boolean(careTeamError)}
                className={styles.carePlanInput}
                id="patient-care-team"
                onChange={(event) => setCareTeamId(event.target.value)}
                placeholder="Enter care team id"
                value={careTeamId}
              />
            )}
            {careTeamError ? (
              <span className={styles.portalFieldError}>{careTeamError}</span>
            ) : null}
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="patient-facility">
              Facility
            </label>
            {facilityOptions.length ? (
              <select
                className={`${styles.carePlanInput} ${facilityError ? styles.portalFieldInputError : ""}`}
                id="patient-facility"
                onChange={(event) => {
                  setFacilityId(event.target.value);
                  setFacilityError(null);
                }}
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
                aria-invalid={Boolean(facilityError)}
                className={styles.carePlanInput}
                id="patient-facility"
                onChange={(event) => setFacilityId(event.target.value)}
                placeholder="Enter facility id"
                value={facilityId}
              />
            )}
            {facilityError ? (
              <span className={styles.portalFieldError}>{facilityError}</span>
            ) : null}
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

        <input
          accept=".csv,text/csv"
          hidden
          onChange={(event) => void handleCsvUpload(event)}
          ref={csvInputRef}
          type="file"
        />

        <div className={styles.portalButtonRow}>
          <button
            className={styles.buttonSecondarySmall}
            onClick={downloadTemplate}
            type="button"
          >
            Download template
          </button>
          <button
            className={styles.buttonSecondarySmall}
            onClick={() => csvInputRef.current?.click()}
            type="button"
          >
            Import CSV
          </button>
        </div>

        <div className={styles.portalIntakeRows}>
          {rows.map((row, index) => (
            <div className={styles.portalIntakeRow} key={row.id}>
              <input
                aria-invalid={Boolean(rowErrors[row.id]?.firstName)}
                aria-label={`Row ${index + 1} first name`}
                className={`${styles.carePlanInput} ${rowErrors[row.id]?.firstName ? styles.portalFieldInputError : ""}`}
                onBlur={handleRowBlur}
                onChange={(event) => updateRow(row.id, "firstName", event.target.value)}
                placeholder="First name"
                ref={(element) => setFieldRef(row.id, "firstName", element)}
                value={row.firstName}
              />
              <input
                aria-invalid={Boolean(rowErrors[row.id]?.lastName)}
                aria-label={`Row ${index + 1} last name`}
                className={`${styles.carePlanInput} ${rowErrors[row.id]?.lastName ? styles.portalFieldInputError : ""}`}
                onBlur={handleRowBlur}
                onChange={(event) => updateRow(row.id, "lastName", event.target.value)}
                placeholder="Last name"
                ref={(element) => setFieldRef(row.id, "lastName", element)}
                value={row.lastName}
              />
              <input
                aria-invalid={Boolean(rowErrors[row.id]?.email)}
                aria-label={`Row ${index + 1} email address`}
                autoComplete="email"
                className={`${styles.carePlanInput} ${rowErrors[row.id]?.email ? styles.portalFieldInputError : ""}`}
                onBlur={handleRowBlur}
                onChange={(event) => updateRow(row.id, "email", event.target.value)}
                placeholder="Email"
                ref={(element) => setFieldRef(row.id, "email", element)}
                type="email"
                value={row.email}
              />
              <input
                aria-invalid={Boolean(rowErrors[row.id]?.dateOfBirth)}
                aria-label={`Row ${index + 1} date of birth`}
                className={`${styles.carePlanInput} ${rowErrors[row.id]?.dateOfBirth ? styles.portalFieldInputError : ""}`}
                onBlur={handleRowBlur}
                onChange={(event) => updateRow(row.id, "dateOfBirth", event.target.value)}
                ref={(element) => setFieldRef(row.id, "dateOfBirth", element)}
                type="date"
                value={row.dateOfBirth}
              />
              <select
                aria-invalid={Boolean(rowErrors[row.id]?.durationMonths)}
                aria-label={`Row ${index + 1} access duration`}
                className={`${styles.carePlanInput} ${rowErrors[row.id]?.durationMonths ? styles.portalFieldInputError : ""}`}
                onBlur={handleRowBlur}
                onChange={(event) =>
                  updateRow(row.id, "durationMonths", event.target.value)
                }
                ref={(element) => setFieldRef(row.id, "durationMonths", element)}
                value={row.durationMonths}
              >
                {DURATION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} months
                  </option>
                ))}
              </select>
              <input
                aria-invalid={Boolean(rowErrors[row.id]?.nhsNumber)}
                aria-label={`Row ${index + 1} NHS number`}
                className={`${styles.carePlanInput} ${rowErrors[row.id]?.nhsNumber ? styles.portalFieldInputError : ""}`}
                onBlur={handleRowBlur}
                onChange={(event) => updateRow(row.id, "nhsNumber", event.target.value)}
                placeholder="NHS number (optional)"
                ref={(element) => setFieldRef(row.id, "nhsNumber", element)}
                value={row.nhsNumber}
              />
              <button
                aria-label={`Remove row ${index + 1}`}
                className={styles.buttonSecondarySmall}
                onClick={() => removeRow(row.id)}
                type="button"
              >
                Remove
              </button>
              {Object.keys(rowErrors[row.id] ?? {}).length ? (
                <div className={styles.portalValidationIssueList}>
                  {Object.entries(rowErrors[row.id] ?? {}).map(([field, message]) =>
                    message ? (
                      <span className={styles.portalValidationIssue} key={`${row.id}-${field}`}>
                        {message}
                      </span>
                    ) : null,
                  )}
                </div>
              ) : null}
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
        <PortalDialog className={styles.modalWarning} labelledBy="invite-error-dialog-title" onClose={() => setError(null)}>
            <h2 className={styles.modalTitle} id="invite-error-dialog-title">Unable to process invite batch</h2>
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
        </PortalDialog>
      ) : null}

      {modalState?.kind === "invalid" ? (
        <PortalDialog
          className={styles.modalWarning}
          labelledBy="invalid-rows-dialog-title"
          onClose={() => setModalState(null)}
        >
            <h2 className={styles.modalTitle} id="invalid-rows-dialog-title">Rows need attention</h2>
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
        </PortalDialog>
      ) : null}

      {modalState?.kind === "confirm" ? (
        <PortalDialog
          labelledBy="review-batch-dialog-title"
          onClose={() => setModalState(null)}
        >
            <h2 className={styles.modalTitle} id="review-batch-dialog-title">Review invite batch</h2>
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
              <Link className={styles.buttonSecondarySmall} href="/portal/patients/invites">
                View invites
              </Link>
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
        </PortalDialog>
      ) : null}

      {modalState?.kind === "created" ? (
        <PortalDialog
          labelledBy="batch-processed-dialog-title"
          onClose={() => setModalState(null)}
        >
            <h2 className={styles.modalTitle} id="batch-processed-dialog-title">Invite batch processed</h2>
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
            {"failedDeliveries" in modalState && modalState.failedDeliveries?.length ? (
              <div className={styles.portalFormSectionList}>
                {modalState.failedDeliveries.map((failure) => (
                  <div
                    className={styles.portalFormSectionItem}
                    key={`${failure.email}-${failure.message}`}
                  >
                    <strong>{failure.email}</strong>
                    <span>{failure.message}</span>
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
        </PortalDialog>
      ) : null}
    </section>
  );
}
