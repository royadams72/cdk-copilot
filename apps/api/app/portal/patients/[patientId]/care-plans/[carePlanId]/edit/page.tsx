"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { normalizeCarePlanReviewLabel } from "@/apps/api/lib/care-plans/shared";
import type {
  PortalPatientCarePlanCreateData,
  PortalPatientCarePlanDetailData,
  PortalPatientCarePlanDiagnosis,
} from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalCarePlanCreateResponse = {
  data: PortalPatientCarePlanCreateData;
};

type PortalCarePlanDetailResponse = {
  data: PortalPatientCarePlanDetailData;
};

type UpdateCarePlanResult = {
  data: PortalPatientCarePlanDetailData;
};

type ConditionSearchItem = {
  code: string;
  codeSystem: "SNOMED_CT";
  label: string;
};

export default function PortalPatientEditCarePlanPage() {
  const params = useParams<{ patientId: string; carePlanId: string }>();
  const router = useRouter();
  const { session, status } = usePortalAuthSession();
  const [formData, setFormData] =
    useState<PortalPatientCarePlanCreateData | null>(null);
  const [planData, setPlanData] =
    useState<PortalPatientCarePlanDetailData | null>(null);
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
  const [draftAction, setDraftAction] = useState<
    "save_as_draft" | "activate_and_notify"
  >("save_as_draft");

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !session ||
      !params.patientId ||
      !params.carePlanId
    ) {
      return;
    }

    const controller = new AbortController();
    const authenticatedSession = session;

    async function loadForm() {
      setLoading(true);
      setError(null);
      try {
        const [formResponse, detailResponse] = await Promise.all([
          fetch(`/api/portal/patients/${params.patientId}/care-plans/add`, {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          }),
          fetch(
            `/api/portal/patients/${params.patientId}/care-plans/${params.carePlanId}`,
            {
              headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
              signal: controller.signal,
            },
          ),
        ]);

        const formBody = (await formResponse.json().catch(() => null)) as
          | PortalCarePlanCreateResponse
          | { error?: { message?: string } }
          | null;
        const detailBody = (await detailResponse.json().catch(() => null)) as
          | PortalCarePlanDetailResponse
          | { error?: { message?: string } }
          | null;

        if (!formResponse.ok || !formBody || !("data" in formBody)) {
          throw new Error(
            formBody && "error" in formBody
              ? formBody.error?.message
              : "Unable to load care plan form",
          );
        }

        if (!detailResponse.ok || !detailBody || !("data" in detailBody)) {
          throw new Error(
            detailBody && "error" in detailBody
              ? detailBody.error?.message
              : "Unable to load care plan",
          );
        }

        if (detailBody.data.plan.status !== "draft") {
          throw new Error("Only draft care plans can be edited.");
        }

        setFormData(formBody.data);
        setPlanData(detailBody.data);
        setDiagnoses(detailBody.data.plan.diagnoses);
        setTitle(detailBody.data.plan.title);
        setTarget(detailBody.data.plan.goals[0]?.targetSummary ?? "");
        setMeasureUsing(detailBody.data.plan.tasks[0]?.label ?? "");
        setNotes(detailBody.data.plan.notes ?? "");
        setFrequency(
          detailBody.data.plan.tasks[0]?.freq ??
            formBody.data.frequencyOptions[0]?.id ??
            "daily",
        );
        setReviewLabel(
          formBody.data.reviewOptions.find(
            (option) =>
              option.id ===
              normalizeCarePlanReviewLabel(detailBody.data.plan.reviewLabel),
          )?.id ??
            formBody.data.reviewOptions[0]?.id ??
            "1_month",
        );
        setOwnerLabels(detailBody.data.plan.ownerLabels);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load care plan draft",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadForm();
    return () => controller.abort();
  }, [params.carePlanId, params.patientId, session, status]);

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
          `/api/terminology/conditions/search?query=${encodeURIComponent(query)}&limit=8`,
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

  function addSelectedDiagnosis() {
    if (!formData || !selectedDiagnosisId) return;
    const match = formData.diagnosisOptions.find(
      (item) => item.id === selectedDiagnosisId,
    );
    if (!match) return;
    addDiagnosis(match);
    setSelectedDiagnosisId("");
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
    if (
      !session ||
      !params.patientId ||
      !params.carePlanId ||
      !formData ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/patients/${params.patientId}/care-plans/${params.carePlanId}`,
        {
          body: JSON.stringify({
            ...(draftAction === "activate_and_notify"
              ? { action: "update_draft_and_activate" }
              : { action: "update_draft" }),
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
          method: "PATCH",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | UpdateCarePlanResult
        | { error?: { message?: string } }
        | null;

      if (!response.ok || !body || !("data" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error?.message
            : "Unable to update care plan",
        );
      }

      router.push(
        `/portal/patients/${params.patientId}/care-plans/${params.carePlanId}`,
      );
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update care plan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <section className={styles.emptyState}>
        Loading care plan draft...
      </section>
    );
  }

  if (!formData || !planData) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Edit care plan unavailable</h2>
        <p>{error ?? "The requested care plan draft could not be loaded."}</p>
      </section>
    );
  }

  const patientHref = planData.patient?.id
    ? `/portal/patients/${planData.patient.id}`
    : params.patientId
      ? `/portal/patients/${params.patientId}`
      : "/portal";
  const carePlansHref = `${patientHref}/care-plans`;

  return (
    <section className={styles.subpageLayout}>
      <PortalPatientSubpageHeader
        backHref={`${patientHref}/care-plans/${params.carePlanId}`}
        backLabel="Back to care plan"
        headline={`Edit Draft ${planData.patient.name}`}
      />

      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Edit Care Plan Draft</h2>
        <p className={styles.carePlanFormLead}>
          {draftAction === "activate_and_notify"
            ? "Update the draft and notify the patient that the care plan is ready."
            : "Update the draft and keep it hidden from the patient for now."}
        </p>
      </div>

      <section className={styles.formShell}>
        <div className={styles.carePlanFormGroup}>
          <label className={styles.carePlanFieldLabel}>
            Associated diagnoses
          </label>
          <p className={styles.dataScreenCaption}>
            Select an existing diagnosis already recorded for this patient, or
            search SNOMED and add a new one.
          </p>
          {formData.diagnosisOptions.length ? (
            <div className={styles.carePlanInlineRow}>
              <select
                className={styles.carePlanInput}
                onChange={(event) => setSelectedDiagnosisId(event.target.value)}
                value={selectedDiagnosisId}
              >
                <option value="">Select existing diagnosis</option>
                {formData.diagnosisOptions.map((option) => (
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
            {formData.frequencyOptions.map((option) => (
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
            {formData.reviewOptions.map((option) => (
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
            {formData.ownerOptions.map((option) => (
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
            htmlFor="care-plan-draft-edit-action"
          >
            Action
          </label>
          <p className={styles.dataScreenCaption}>
            Choose whether to keep this as a draft or activate it and notify the
            patient now.
          </p>
          <select
            className={styles.carePlanInput}
            id="care-plan-draft-edit-action"
            onChange={(event) =>
              setDraftAction(
                event.target.value === "activate_and_notify"
                  ? "activate_and_notify"
                  : "save_as_draft",
              )
            }
            value={draftAction}
          >
            <option value="save_as_draft">Save as draft</option>
            <option value="activate_and_notify">
              Activate care plan and notify patient
            </option>
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
              : draftAction === "activate_and_notify"
                ? "Continue and notify patient"
                : "Continue to draft"}
          </button>
        </div>
      </section>
    </section>
  );
}
