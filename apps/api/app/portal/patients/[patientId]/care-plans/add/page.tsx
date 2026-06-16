"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import type {
  PortalPatientCarePlanCreateData,
  PortalPatientCarePlanDiagnosis,
} from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalCarePlanCreateResponse = {
  data: PortalPatientCarePlanCreateData;
};

type CreateCarePlanResult = {
  data: {
    carePlanId: string;
  };
};

export default function PortalPatientAddCarePlanPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const { session, status } = usePortalSession();
  const [data, setData] = useState<PortalPatientCarePlanCreateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState("");
  const [customDiagnosis, setCustomDiagnosis] = useState("");
  const [diagnoses, setDiagnoses] = useState<PortalPatientCarePlanDiagnosis[]>([]);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [measureUsing, setMeasureUsing] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [reviewLabel, setReviewLabel] = useState("1_month");
  const [ownerLabels, setOwnerLabels] = useState<string[]>([]);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const controller = new AbortController();
    const authenticatedSession = session;

    async function loadForm() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/care-plans/add`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalCarePlanCreateResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load care plan form",
          );
        }

        setData(body.data);
        setFrequency(body.data.frequencyOptions[0]?.id ?? "daily");
        setReviewLabel(body.data.reviewOptions[2]?.id ?? body.data.reviewOptions[0]?.id ?? "1_month");
        setOwnerLabels(body.data.ownerOptions[0] ? [body.data.ownerOptions[0].label] : []);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load care plan form",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadForm();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  function addSelectedDiagnosis() {
    if (!data || !selectedDiagnosisId) return;
    const match = data.diagnosisOptions.find((item) => item.id === selectedDiagnosisId);
    if (!match || diagnoses.some((item) => item.label === match.label)) return;
    setDiagnoses((current) => [...current, match]);
    setSelectedDiagnosisId("");
  }

  function addCustomDiagnosis() {
    const label = customDiagnosis.trim();
    if (!label) return;
    if (diagnoses.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      setCustomDiagnosis("");
      return;
    }
    setDiagnoses((current) => [
      ...current,
      { code: null, id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label },
    ]);
    setCustomDiagnosis("");
  }

  function removeDiagnosis(id: string) {
    setDiagnoses((current) => current.filter((item) => item.id !== id));
  }

  function toggleOwner(label: string) {
    setOwnerLabels((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  }

  async function submitForm() {
    if (!session || !params.patientId || !data || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/care-plans/add`,
        {
          body: JSON.stringify({
            diagnoses: diagnoses.map((item) => ({
              ...(item.code ? { code: item.code } : {}),
              label: item.label,
            })),
            frequency,
            measureUsing,
            ownerLabels,
            reviewLabel:
              data.reviewOptions.find((option) => option.id === reviewLabel)?.label ??
              reviewLabel,
            target,
            title,
          }),
          headers: {
            ...getPortalSessionAuthHeaders(session.jwt),
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | CreateCarePlanResult
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to create care plan",
        );
      }

      router.push(
        `/portal/patients/${params.patientId}/care-plans/${body.data.carePlanId}`,
      );
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to create care plan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || loading) {
    return <section className={styles.emptyState}>Loading care plan form...</section>;
  }

  if (!data) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Add care plan unavailable</h2>
        <p>{error ?? "The requested care plan form could not be loaded."}</p>
      </section>
    );
  }

  const patientHref = data.patient?.id
    ? `/portal/patients/${data.patient.id}`
    : params.patientId
      ? `/portal/patients/${params.patientId}`
      : "/portal";
  const carePlansHref = `${patientHref}/care-plans`;

  return (
    <section className={styles.subpageLayout}>
      <PortalPatientSubpageHeader
        backHref={carePlansHref}
        backLabel="Back to care plans"
        headline={data.headline}
      />

      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Add Care Plan</h2>
        <p className={styles.carePlanFormLead}>
          The patient will be sent a notification to begin.
        </p>
      </div>

      <section className={styles.carePlanFormShell}>
        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>Associated diagnoses</label>
          <p className={styles.dataScreenCaption}>
            Choose one or more diagnoses to link to this care plan. Optional.
          </p>
          <div className={styles.carePlanInlineRow}>
            <select
              className={styles.carePlanInput}
              onChange={(event) => setSelectedDiagnosisId(event.target.value)}
              value={selectedDiagnosisId}
            >
              <option value="">Select diagnosis</option>
              {data.diagnosisOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className={styles.buttonPrimarySmall}
              onClick={addSelectedDiagnosis}
              type="button"
            >
              Add diagnosis
            </button>
          </div>
          <div className={styles.carePlanInlineRow}>
            <input
              className={styles.carePlanInput}
              onChange={(event) => setCustomDiagnosis(event.target.value)}
              placeholder="Add diagnosis"
              value={customDiagnosis}
            />
            <button
              className={styles.buttonPrimarySmall}
              onClick={addCustomDiagnosis}
              type="button"
            >
              Add custom
            </button>
          </div>
          {diagnoses.length ? (
            <div className={styles.carePlanChipList}>
              {diagnoses.map((diagnosis) => (
                <button
                  className={styles.carePlanChip}
                  key={diagnosis.id}
                  onClick={() => removeDiagnosis(diagnosis.id)}
                  type="button"
                >
                  {diagnosis.label} ×
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="care-plan-title">
            Goal of care plan
          </label>
          <p className={styles.dataScreenCaption}>
            This is the description and should be the title of the plan.
          </p>
          <input
            className={styles.carePlanInput}
            id="care-plan-title"
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Reduce blood pressure"
            value={title}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="care-plan-target">
            Target
          </label>
          <p className={styles.dataScreenCaption}>Target to meet.</p>
          <input
            className={styles.carePlanInput}
            id="care-plan-target"
            maxLength={120}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="Below 130/80"
            value={target}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="care-plan-measure">
            Measure using
          </label>
          <p className={styles.dataScreenCaption}>
            Describe how the patient should measure progress.
          </p>
          <input
            className={styles.carePlanInput}
            id="care-plan-measure"
            maxLength={60}
            onChange={(event) => setMeasureUsing(event.target.value)}
            placeholder="BP machine"
            value={measureUsing}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="care-plan-frequency">
            Frequency to measure
          </label>
          <select
            className={styles.carePlanInput}
            id="care-plan-frequency"
            onChange={(event) => setFrequency(event.target.value)}
            value={frequency}
          >
            {data.frequencyOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel} htmlFor="care-plan-review">
            Review in
          </label>
          <select
            className={styles.carePlanInput}
            id="care-plan-review"
            onChange={(event) => setReviewLabel(event.target.value)}
            value={reviewLabel}
          >
            {data.reviewOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>Owner</label>
          <p className={styles.dataScreenCaption}>
            Who will review this? You can select multiple.
          </p>
          <div className={styles.carePlanOwnerList}>
            {data.ownerOptions.map((option) => (
              <label className={styles.carePlanOwnerOption} key={option.id}>
                <input
                  checked={ownerLabels.includes(option.label)}
                  onChange={() => toggleOwner(option.label)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error ? <p className={styles.dataScreenCaption}>{error}</p> : null}

        <div className={styles.carePlanSubmitRow}>
          <button
            className={styles.buttonPrimarySmall}
            disabled={
              submitting ||
              !title.trim() ||
              !target.trim() ||
              !measureUsing.trim() ||
              ownerLabels.length === 0
            }
            onClick={() => void submitForm()}
            type="button"
          >
            {submitting ? "Adding..." : "Add Care Plan"}
          </button>
        </div>
      </section>
    </section>
  );
}
