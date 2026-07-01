"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import type {
  PortalPatientFilter,
  PortalPatientListItem,
  PortalPatientRiskFilter,
} from "@/apps/api/lib/portal/patient-shared";
import {
  normalizePortalPatientFilter,
  normalizePortalPatientRiskFilter,
} from "@/apps/api/lib/portal/patient-shared";
import { CKD_STAGE_VALUES } from "@ckd/core";

type PortalPatientsResponse = {
  data: {
    matchedPatients: number;
    patients: PortalPatientListItem[];
    totalPatients: number;
  };
};

const riskOptions: Array<{ label: string; value: PortalPatientRiskFilter }> = [
  { label: "Any risk", value: "all" },
  { label: "Red", value: "red" },
  { label: "Amber", value: "amber" },
  { label: "Green", value: "green" },
  { label: "Unknown", value: "unknown" },
];

const filterOptions: Array<{ label: string; value: PortalPatientFilter }> = [
  { label: "All patients", value: "all" },
  { label: "Worsening trends", value: "worsening" },
  { label: "Care plan review due", value: "review" },
  { label: "Missing data / disengaged", value: "disengaged" },
  { label: "Access ending soon", value: "endingSoon" },
];

export default function PortalAdvancedSearchPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, status } = usePortalAuthSession();
  const [patients, setPatients] = useState<PortalPatientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedPatients, setMatchedPatients] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);

  const query = searchParams.get("q")?.trim() ?? "";
  const filter = normalizePortalPatientFilter(searchParams.get("filter"));
  const risk = normalizePortalPatientRiskFilter(searchParams.get("risk"));
  const stage = searchParams.get("stage")?.trim() ?? "";
  const careTeamId = searchParams.get("careTeamId")?.trim() ?? "";
  const facilityId = searchParams.get("facilityId")?.trim() ?? "";

  const [draftQuery, setDraftQuery] = useState(query);
  const [draftFilter, setDraftFilter] = useState<PortalPatientFilter>(filter);
  const [draftRisk, setDraftRisk] = useState<PortalPatientRiskFilter>(risk);
  const [draftStage, setDraftStage] = useState(stage);
  const [draftCareTeamId, setDraftCareTeamId] = useState(careTeamId);
  const [draftFacilityId, setDraftFacilityId] = useState(facilityId);

  useEffect(() => {
    setDraftQuery(query);
    setDraftFilter(filter);
    setDraftRisk(risk);
    setDraftStage(stage);
    setDraftCareTeamId(careTeamId);
    setDraftFacilityId(facilityId);
  }, [careTeamId, facilityId, filter, query, risk, stage]);

  useEffect(() => {
    if (status !== "authenticated" || !session) {
      return;
    }
    const authenticatedSession = session;

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (filter !== "all") params.set("filter", filter);
    if (risk !== "all") params.set("risk", risk);
    if (stage) params.set("stage", stage);
    if (careTeamId) params.set("careTeamId", careTeamId);
    if (facilityId) params.set("facilityId", facilityId);

    const controller = new AbortController();

    async function loadPatients() {
      setLoading(true);
      setError(null);
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
        setMatchedPatients(body.data.matchedPatients);
        setTotalPatients(body.data.totalPatients);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setPatients([]);
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load patients",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadPatients();
    return () => controller.abort();
  }, [careTeamId, facilityId, filter, query, risk, session, stage, status]);

  const careTeamOptions = useMemo(
    () => session?.user.careTeamIds ?? [],
    [session?.user.careTeamIds],
  );
  const facilityOptions = useMemo(
    () => session?.user.facilityIds ?? [],
    [session?.user.facilityIds],
  );

  function submitSearch() {
    const params = new URLSearchParams();
    if (draftQuery.trim()) params.set("q", draftQuery.trim());
    if (draftFilter !== "all") params.set("filter", draftFilter);
    if (draftRisk !== "all") params.set("risk", draftRisk);
    if (draftStage.trim()) params.set("stage", draftStage.trim());
    if (draftCareTeamId.trim()) params.set("careTeamId", draftCareTeamId.trim());
    if (draftFacilityId.trim()) params.set("facilityId", draftFacilityId.trim());
    router.push(
      `/portal/advanced-search${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  function clearSearch() {
    setDraftQuery("");
    setDraftFilter("all");
    setDraftRisk("all");
    setDraftStage("");
    setDraftCareTeamId("");
    setDraftFacilityId("");
    router.push("/portal/advanced-search");
  }

  if (status === "loading") {
    return <section className={styles.emptyState}>Loading advanced search...</section>;
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.carePlanFormIntro}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2 className={styles.carePlanFormTitle}>Advanced Search</h2>
        <p className={styles.carePlanFormLead}>
          Search by patient details, stage, risk, team, facility, or current follow-up state.
        </p>
      </div>

      <section className={styles.portalFormShellWide}>
        <div className={styles.portalFormGrid}>
          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-query">
              Search
            </label>
            <input
              className={styles.carePlanInput}
              id="advanced-query"
              onChange={(event) => setDraftQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Name, email, date of birth or CKD stage"
              value={draftQuery}
            />
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-filter">
              Status
            </label>
            <select
              className={styles.carePlanInput}
              id="advanced-filter"
              onChange={(event) =>
                setDraftFilter(normalizePortalPatientFilter(event.target.value))
              }
              value={draftFilter}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-risk">
              Risk
            </label>
            <select
              className={styles.carePlanInput}
              id="advanced-risk"
              onChange={(event) =>
                setDraftRisk(normalizePortalPatientRiskFilter(event.target.value))
              }
              value={draftRisk}
            >
              {riskOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-stage">
              CKD stage
            </label>
            <select
              className={styles.carePlanInput}
              id="advanced-stage"
              onChange={(event) => setDraftStage(event.target.value)}
              value={draftStage}
            >
              <option value="">Any stage</option>
              {CKD_STAGE_VALUES.map((value) => (
                <option key={value} value={value}>
                  Stage {value}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-care-team">
              Care team
            </label>
            <select
              className={styles.carePlanInput}
              id="advanced-care-team"
              onChange={(event) => setDraftCareTeamId(event.target.value)}
              value={draftCareTeamId}
            >
              <option value="">Any care team</option>
              {careTeamOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-facility">
              Facility
            </label>
            <select
              className={styles.carePlanInput}
              id="advanced-facility"
              onChange={(event) => setDraftFacilityId(event.target.value)}
              value={draftFacilityId}
            >
              <option value="">Any facility</option>
              {facilityOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.portalButtonRow}>
          <button
            className={styles.buttonSecondarySmall}
            onClick={clearSearch}
            type="button"
          >
            Clear
          </button>
          <button
            className={styles.buttonPrimarySmall}
            onClick={submitSearch}
            type="button"
          >
            Search
          </button>
        </div>
      </section>

      <section className={styles.portalResultCard}>
        <div className={styles.portalResultHeader}>
          <h3 className={styles.carePlanPanelTitle}>Results</h3>
          <p className={styles.dataScreenCaption}>
            {matchedPatients} matched of {totalPatients} accessible patients.
          </p>
        </div>

        {loading ? (
          <p className={styles.dataScreenCaption}>Loading patients...</p>
        ) : error ? (
          <p className={styles.dataScreenCaption}>{error}</p>
        ) : patients.length ? (
          <div className={styles.portalFormSectionList}>
            {patients.map((patient) => (
              <Link
                className={styles.portalFormSectionItem}
                href={`/portal/patients/${patient.id}`}
                key={patient.id}
              >
                <strong>{patient.name}</strong>
                <span>
                  {patient.email || "No email"} · {patient.dateOfBirth || "No DOB"} ·
                  {patient.stage ? `Stage ${patient.stage}` : "Stage not set"}
                </span>
                <span>
                  Risk {patient.risk} · Last contact{" "}
                  {patient.lastContactAt
                    ? new Date(patient.lastContactAt).toLocaleDateString("en-GB")
                    : "not recorded"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.dataScreenCaption}>
            No patients match the current filters.
          </p>
        )}
      </section>
    </section>
  );
}
