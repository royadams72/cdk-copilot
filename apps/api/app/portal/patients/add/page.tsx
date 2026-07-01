"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import { CKD_STAGE_VALUES } from "@ckd/core";

type AddPatientResponse = {
  data: {
    patient: {
      id: string;
      name: string;
    };
  };
};

export default function PortalAddPatientPage() {
  const router = useRouter();
  const { session, status } = usePortalAuthSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [stage, setStage] = useState("");
  const [careTeamId, setCareTeamId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const careTeamOptions = useMemo(
    () => session?.user.careTeamIds ?? [],
    [session?.user.careTeamIds],
  );
  const facilityOptions = useMemo(
    () => session?.user.facilityIds ?? [],
    [session?.user.facilityIds],
  );

  useEffect(() => {
    if (!careTeamId && careTeamOptions.length === 1) {
      setCareTeamId(careTeamOptions[0]);
    }
  }, [careTeamId, careTeamOptions]);

  useEffect(() => {
    if (!facilityId && facilityOptions.length === 1) {
      setFacilityId(facilityOptions[0]);
    }
  }, [facilityId, facilityOptions]);

  const canSubmit = Boolean(
    firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      dateOfBirth.trim() &&
      careTeamId.trim() &&
      facilityId.trim(),
  );

  async function submitForm() {
    if (!session || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/portal/patients/add", {
        body: JSON.stringify({
          careTeamId,
          dateOfBirth,
          email,
          facilityId,
          firstName,
          lastName,
          ...(stage ? { stage } : {}),
        }),
        headers: {
          ...getPortalSessionAuthHeaders(session.jwt),
          "content-type": "application/json",
        },
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as
        | AddPatientResponse
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to add patient",
        );
      }

      router.push(`/portal/patients/${body.data.patient.id}`);
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to add patient",
      );
    } finally {
      setSubmitting(false);
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
        <h2 className={styles.carePlanFormTitle}>Add Patient</h2>
        <p className={styles.carePlanFormLead}>
          Create the patient record and queue care team access for approval.
        </p>
      </div>

      <section className={styles.carePlanFormShell}>
        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="patient-first-name">
            First name
          </label>
          <input
            className={styles.carePlanInput}
            id="patient-first-name"
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="Roy"
            value={firstName}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="patient-last-name">
            Last name
          </label>
          <input
            className={styles.carePlanInput}
            id="patient-last-name"
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Adams"
            value={lastName}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="patient-email">
            Email
          </label>
          <input
            className={styles.carePlanInput}
            id="patient-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="patient@example.com"
            type="email"
            value={email}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="patient-dob">
            Date of birth
          </label>
          <input
            className={styles.carePlanInput}
            id="patient-dob"
            onChange={(event) => setDateOfBirth(event.target.value)}
            type="date"
            value={dateOfBirth}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="patient-stage">
            CKD stage
          </label>
          <select
            className={styles.carePlanInput}
            id="patient-stage"
            onChange={(event) => setStage(event.target.value)}
            value={stage}
          >
            <option value="">Not set yet</option>
            {CKD_STAGE_VALUES.map((value) => (
              <option key={value} value={value}>
                Stage {value}
              </option>
            ))}
          </select>
        </div>

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
                <option key={value} value={value}>
                  {value}
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
                <option key={value} value={value}>
                  {value}
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

        {error ? <p className={styles.dataScreenCaption}>{error}</p> : null}

        <div className={styles.portalButtonRow}>
          <button
            className={styles.buttonPrimarySmall}
            disabled={!canSubmit || submitting}
            onClick={submitForm}
            type="button"
          >
            {submitting ? "Creating..." : "Continue"}
          </button>
        </div>
      </section>
    </section>
  );
}
