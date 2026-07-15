"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatPatientLifecycleStatusLabel } from "@/apps/api/lib/portal/patientLifecycle";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import type {
  PortalPatientFilter,
  PortalPatientListItem,
} from "@/apps/api/lib/portal/patient-shared";
import { normalizePortalPatientFilter } from "@/apps/api/lib/portal/patient-shared";
import { CKD_STAGE_VALUES } from "@ckd/core";

type PortalPatientsResponse = {
  data: {
    matchedPatients: number;
    patients: PortalPatientListItem[];
    totalPatients: number;
  };
};

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
  const dateOfBirth = searchParams.get("dob")?.trim() ?? "";
  const filter = normalizePortalPatientFilter(searchParams.get("filter"));
  const stage = searchParams.get("stage")?.trim() ?? "";
  const careTeamId = searchParams.get("careTeamId")?.trim() ?? "";
  const facilityId = searchParams.get("facilityId")?.trim() ?? "";

  const [draftQuery, setDraftQuery] = useState(query);
  const [draftDateOfBirth, setDraftDateOfBirth] = useState(dateOfBirth);
  const [draftFilter, setDraftFilter] = useState<PortalPatientFilter>(filter);
  const [draftStage, setDraftStage] = useState(stage);
  const [draftCareTeamId, setDraftCareTeamId] = useState(careTeamId);
  const [draftFacilityId, setDraftFacilityId] = useState(facilityId);

  useEffect(() => {
    setDraftQuery(query);
    setDraftDateOfBirth(dateOfBirth);
    setDraftFilter(filter);
    setDraftStage(stage);
    setDraftCareTeamId(careTeamId);
    setDraftFacilityId(facilityId);
  }, [careTeamId, dateOfBirth, facilityId, filter, query, stage]);

  useEffect(() => {
    if (status !== "authenticated" || !session) {
      return;
    }
    const authenticatedSession = session;

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (dateOfBirth) params.set("dob", dateOfBirth);
    if (filter !== "all") params.set("filter", filter);
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
  }, [careTeamId, dateOfBirth, facilityId, filter, query, session, stage, status]);

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
      const selectedCareTeam = careTeamOptions.find((item) => item.id === draftCareTeamId);

      if (!selectedCareTeam?.facilityId) {
        return scopedFacilities;
      }

      return scopedFacilities.filter((item) => item.id === selectedCareTeam.facilityId);
    },
    [
      careTeamOptions,
      draftCareTeamId,
      session?.user.facilities,
      session?.user.facilityIds,
    ],
  );

  useEffect(() => {
    if (!draftFacilityId) {
      return;
    }

    if (!facilityOptions.some((item) => item.id === draftFacilityId)) {
      setDraftFacilityId("");
    }
  }, [draftFacilityId, facilityOptions]);

  function submitSearch() {
    const params = new URLSearchParams();
    if (draftQuery.trim()) params.set("q", draftQuery.trim());
    if (draftDateOfBirth.trim()) params.set("dob", draftDateOfBirth.trim());
    if (draftFilter !== "all") params.set("filter", draftFilter);
    if (draftStage.trim()) params.set("stage", draftStage.trim());
    if (draftCareTeamId.trim()) params.set("careTeamId", draftCareTeamId.trim());
    if (draftFacilityId.trim()) params.set("facilityId", draftFacilityId.trim());
    router.push(
      `/portal/advanced-search${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  function clearSearch() {
    setDraftQuery("");
    setDraftDateOfBirth("");
    setDraftFilter("all");
    setDraftStage("");
    setDraftCareTeamId("");
    setDraftFacilityId("");
    router.push("/portal/advanced-search");
  }

  if (status === "loading") {
    return <PortalLoadingState label="Loading advanced search..." />;
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.carePlanFormIntro}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2 className={styles.carePlanFormTitle}>Advanced Search</h2>
        <p className={styles.carePlanFormLead}>
          Search by patient name, email, date of birth, stage, team, facility, or current follow-up state.
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
              placeholder="Patient name or email"
              value={draftQuery}
            />
          </div>

          <div className={styles.carePlanFormGroup}>
            <label className={styles.carePlanFieldLabel} htmlFor="advanced-dob">
              Date of birth
            </label>
            <input
              className={styles.carePlanInput}
              id="advanced-dob"
              onChange={(event) => setDraftDateOfBirth(event.target.value)}
              type="date"
              value={draftDateOfBirth}
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
                <option key={value.id} value={value.id}>
                  {value.label}
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
                <option key={value.id} value={value.id}>
                  {value.label}
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
          <PortalLoadingState label="Loading patients..." />
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
                  {formatPatientLifecycleStatusLabel(patient.membershipStatus)} ·{" "}
                  {patient.accessEndsAt
                    ? `Access ends ${new Date(patient.accessEndsAt).toLocaleDateString("en-GB")}`
                    : "No access end date"}
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
