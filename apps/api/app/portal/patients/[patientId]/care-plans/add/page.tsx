"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
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

type CarePlanCreateAction = "activate_and_notify" | "save_as_draft";
type ConditionSearchItem = {
  code: string;
  codeSystem: "SNOMED_CT";
  label: string;
};

export default function PortalPatientAddCarePlanPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const { session, status } = usePortalAuthSession();
  const [data, setData] = useState<PortalPatientCarePlanCreateData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState("");
  const [conditionQuery, setConditionQuery] = useState("");
  const [conditionResults, setConditionResults] = useState<
    ConditionSearchItem[]
  >([]);
  const [conditionSearchLoading, setConditionSearchLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState<PortalPatientCarePlanDiagnosis[]>(
    [],
  );
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [measureUsing, setMeasureUsing] = useState("");
  const [notes, setNotes] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [reviewLabel, setReviewLabel] = useState("1_month");
  const [ownerLabels, setOwnerLabels] = useState<string[]>([]);
  const [action, setAction] = useState<CarePlanCreateAction>(
    "activate_and_notify",
  );

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
        setReviewLabel(
          body.data.reviewOptions[2]?.id ??
            body.data.reviewOptions[0]?.id ??
            "1_month",
        );
        setOwnerLabels(
          body.data.ownerOptions[0] ? [body.data.ownerOptions[0].label] : [],
        );
        setAction(
          (body.data.actionOptions[0]?.id as
            | CarePlanCreateAction
            | undefined) ?? "activate_and_notify",
        );
        setDiagnoses(body.data.diagnosisOptions);
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

  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    const query = conditionQuery.trim();
    if (query.length < 2) {
      setConditionResults([]);
      setConditionSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setConditionSearchLoading(true);
      try {
        const response = await fetch(
          `/api/terminology/conditions/search?query=${encodeURIComponent(
            query,
          )}&limit=8`,
          {
            headers: getPortalSessionAuthHeaders(session.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { data?: { items?: ConditionSearchItem[] } }
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to search conditions",
          );
        }

        setConditionResults(body.data?.items ?? []);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setConditionResults([]);
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to search conditions",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setConditionSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [conditionQuery, session, status]);

  function addSelectedDiagnosis() {
    if (!data || !selectedDiagnosisId) return;
    const match = data.diagnosisOptions.find(
      (item) => item.id === selectedDiagnosisId,
    );
    if (!match) return;
    addDiagnosis(match);
    setSelectedDiagnosisId("");
  }

  function addDiagnosis(diagnosis: PortalPatientCarePlanDiagnosis) {
    if (
      diagnoses.some(
        (item) =>
          item.label.toLowerCase() === diagnosis.label.toLowerCase() ||
          (!!item.code && !!diagnosis.code && item.code === diagnosis.code),
      )
    ) {
      return;
    }
    setDiagnoses((current) => [...current, diagnosis]);
    setConditionQuery("");
    setConditionResults([]);
  }

  function addCustomDiagnosis() {
    const label = conditionQuery.trim();
    if (!label) return;
    if (
      diagnoses.some((item) => item.label.toLowerCase() === label.toLowerCase())
    ) {
      setConditionQuery("");
      return;
    }
    addDiagnosis({
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      code: null,
      codeSystem: "CUSTOM",
      label,
    });
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
            action,
            diagnoses: diagnoses.map((item) => ({
              ...(item.code ? { code: item.code } : {}),
              ...(item.codeSystem ? { codeSystem: item.codeSystem } : {}),
              label: item.label,
            })),
            frequency,
            measureUsing,
            notes,
            ownerLabels,
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
    return <PortalLoadingState label="Loading care plan form..." />;
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

  const actionLead =
    action === "save_as_draft"
      ? "This will save the care plan as a draft so the team can review it before sending."
      : "This will create the care plan and notify the patient to begin.";

  return (
    <section className={styles.subpageLayout}>
      <PortalPatientSubpageHeader
        backHref={carePlansHref}
        backLabel="Back to care plans"
        headline={data.headline}
      />

      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Add Care Plan</h2>
        <p className={styles.carePlanFormLead}>{actionLead}</p>
      </div>

      <section className={styles.formShell}>
        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>
            Associated diagnoses
          </label>

          <p className={styles.dataScreenCaption}>
            Select an existing diagnosis already recorded for this patient, or
            search SNOMED and add a new one. (optional)
          </p>
          {data.diagnosisOptions.length ? (
            <div className={styles.carePlanInlineRow}>
              <select
                className={styles.carePlanInput}
                onChange={(event) => setSelectedDiagnosisId(event.target.value)}
                value={selectedDiagnosisId}
              >
                <option value="">Select existing diagnosis</option>
                {data.diagnosisOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                className={styles.buttonPrimarySmall}
                disabled={!selectedDiagnosisId}
                onClick={addSelectedDiagnosis}
                type="button"
              >
                Add diagnosis
              </button>
            </div>
          ) : null}
          <div className={styles.carePlanFormGroup}>
            <input
              className={styles.carePlanInput}
              onChange={(event) => setConditionQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addCustomDiagnosis();
              }}
              placeholder="Search condition or enter custom diagnosis"
              value={conditionQuery}
            />
          </div>
          <p className={styles.dataScreenCaption}>
            Select a search result to add it, or press Enter to save custom
            text.
          </p>
          {conditionSearchLoading ? (
            <p className={styles.dataScreenCaption}>Searching conditions...</p>
          ) : null}
          {conditionResults.length ? (
            <div className={styles.carePlanSearchResults}>
              {conditionResults.map((result) => (
                <button
                  className={styles.carePlanSearchResult}
                  key={result.code}
                  onClick={() =>
                    addDiagnosis({
                      id: result.code,
                      code: result.code,
                      codeSystem: result.codeSystem,
                      label: result.label,
                    })
                  }
                  type="button"
                >
                  {result.label}
                </button>
              ))}
            </div>
          ) : null}
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
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-title"
          >
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
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-target"
          >
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
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-measure"
          >
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
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-notes"
          >
            Notes
          </label>
          <p className={styles.dataScreenCaption}>
            Optional clinician note shown on the care plan detail page.
          </p>
          <textarea
            className={styles.carePlanTextarea}
            id="care-plan-notes"
            maxLength={2000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add any context or instructions for this plan"
            rows={4}
            value={notes}
          />
        </div>

        <div className={styles.carePlanFormGroup}>
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-frequency"
          >
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
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-review"
          >
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

        <div className={styles.carePlanFormGroup}>
          <label
            className={styles.carePlanFieldLabel}
            htmlFor="care-plan-action"
          >
            Action
          </label>
          <p className={styles.dataScreenCaption}>
            Choose whether to activate the plan now or keep it as a draft for
            later review.
          </p>
          <select
            className={styles.carePlanInput}
            id="care-plan-action"
            onChange={(event) =>
              setAction(event.target.value as CarePlanCreateAction)
            }
            value={action}
          >
            {data.actionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
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
            {submitting
              ? "Saving..."
              : action === "save_as_draft"
                ? "Continue to draft"
                : "Continue and notify patient"}
          </button>
        </div>
      </section>
    </section>
  );
}
