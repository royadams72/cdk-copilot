"use client";

import Link from "next/link";
import { useState } from "react";

import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";
import styles from "@/apps/api/app/portal/portal.module.css";
import { CKD_STAGE_VALUES } from "@ckd/core";

const metricOptions = [
  ["weight", "Weight"], ["bloodPressure", "Blood pressure"], ["symptoms", "Symptoms"],
  ["steps", "Steps"], ["nutrition", "Nutrition"],
] as const;
const directionOptions = [["increase", "Increasing"], ["decrease", "Decreasing"]] as const;

type Result = {
  id: string; name: string; email: string | null; stage: string | null;
  matches: Array<{ current: number; direction: string; label: string; metric: string; previous: number; unit: string }>;
};

export function PortalTrendSearch() {
  const { session, status } = usePortalAuthSession();
  const [metrics, setMetrics] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [days, setDays] = useState(30);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [query, setQuery] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [stage, setStage] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string, values: string[], setValues: (next: string[]) => void) {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  async function search() {
    if (!session || !metrics.length || !directions.length) {
      setError("Select at least one item and one direction.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/patients/trend-search", {
        method: "POST",
        headers: { ...getPortalSessionAuthHeaders(session.jwt), "content-type": "application/json" },
        body: JSON.stringify({ dateOfBirth, days, directions, matchMode, metrics, query, stage }),
      });
      const body = await response.json().catch(() => null) as { data?: { patients?: Result[]; totalPatients?: number }; error?: { message?: string } } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message || "Unable to run search");
      setResults(body.data.patients ?? []);
      setTotal(body.data.totalPatients ?? 0);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run search");
      setResults(null);
    } finally { setLoading(false); }
  }

  if (status === "loading") return <PortalLoadingState label="Loading search..." />;

  return (
    <div className={styles.subpageLayout}>
      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Advanced search</h2>
        <p className={styles.carePlanFormLead}>Compare two equal periods when you choose to search. Results describe recorded data only and do not create alerts, priorities, or follow-up tasks.</p>
      </div>
      <form className={styles.portalFormShellWide} onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <div className={styles.portalFormGrid}>
          <label className={styles.carePlanFormGroup}><span className={styles.carePlanFieldLabel}>Patient</span><input className={styles.carePlanInput} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" value={query} /></label>
          <label className={styles.carePlanFormGroup}><span className={styles.carePlanFieldLabel}>Date of birth</span><input className={styles.carePlanInput} onChange={(event) => setDateOfBirth(event.target.value)} type="date" value={dateOfBirth} /></label>
          <label className={styles.carePlanFormGroup}><span className={styles.carePlanFieldLabel}>CKD stage</span><select className={styles.carePlanInput} onChange={(event) => setStage(event.target.value)} value={stage}><option value="">Any stage</option>{CKD_STAGE_VALUES.map((value) => <option key={value} value={value}>Stage {value}</option>)}</select></label>
        </div>
        <fieldset className={styles.carePlanFormGroup}>
          <legend className={styles.carePlanFieldLabel}>Recorded items</legend>
          <div className={styles.portalButtonRow}>
            {metricOptions.map(([value, label]) => <label key={value}><input checked={metrics.includes(value)} onChange={() => toggle(value, metrics, setMetrics)} type="checkbox" /> {label}</label>)}
          </div>
        </fieldset>
        <fieldset className={styles.carePlanFormGroup}>
          <legend className={styles.carePlanFieldLabel}>Direction</legend>
          <div className={styles.portalButtonRow}>
            {directionOptions.map(([value, label]) => <label key={value}><input checked={directions.includes(value)} onChange={() => toggle(value, directions, setDirections)} type="checkbox" /> {label}</label>)}
          </div>
        </fieldset>
        <div className={styles.portalFormGrid}>
          <label className={styles.carePlanFormGroup}><span className={styles.carePlanFieldLabel}>Comparison period</span><select className={styles.carePlanInput} onChange={(event) => setDays(Number(event.target.value))} value={days}>{[7,14,30,60,90].map((value) => <option key={value} value={value}>{value} days versus previous {value} days</option>)}</select></label>
          <label className={styles.carePlanFormGroup}><span className={styles.carePlanFieldLabel}>When several items are selected</span><select className={styles.carePlanInput} onChange={(event) => setMatchMode(event.target.value as "any" | "all")} value={matchMode}><option value="any">Match any selected item</option><option value="all">Match all selected items</option></select></label>
        </div>
        <div className={styles.portalButtonRow}><button className={styles.buttonSecondarySmall} onClick={() => { setQuery(""); setDateOfBirth(""); setStage(""); setMetrics([]); setDirections([]); setResults(null); setError(null); }} type="button">Clear</button><button className={styles.buttonPrimarySmall} disabled={loading} type="submit">{loading ? "Searching..." : "Search recorded data"}</button></div>
      </form>
      {error ? <p className={styles.dataScreenCaption}>{error}</p> : null}
      {results ? <section className={styles.portalResultCard}><div className={styles.portalResultHeader}><h3 className={styles.carePlanPanelTitle}>Results</h3><p className={styles.dataScreenCaption}>{results.length} matched of {total} accessible patients.</p></div>{results.length ? <div className={styles.portalFormSectionList}>{results.map((patient) => <Link className={styles.portalFormSectionItem} href={`/portal/patients/${patient.id}`} key={patient.id}><strong>{patient.name}</strong><span>{patient.email || "No email"} · {patient.stage ? `Stage ${patient.stage}` : "Stage not set"}</span>{patient.matches.map((match) => <span key={match.metric}>{match.label}: {match.direction}, {match.previous} to {match.current} {match.unit}</span>)}</Link>)}</div> : <p className={styles.dataScreenCaption}>No records matched these factual comparison filters.</p>}</section> : null}
    </div>
  );
}
