"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import type { PortalPatientLabData } from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalPatientLabsResponse = {
  data: PortalPatientLabData;
};

function formatLabFlag(flag: string | null) {
  if (!flag || flag === "N") return "In range";
  if (flag === "HH") return "Critical high";
  if (flag === "LL") return "Critical low";
  if (flag === "H") return "High";
  if (flag === "L") return "Low";
  if (flag === "A") return "Abnormal";
  return flag;
}

function dotColor(flag: string | null) {
  if (flag === "HH" || flag === "LL") return "#c62828";
  if (flag === "H" || flag === "L" || flag === "A") return "#ef6c00";
  return "#0b63b6";
}

export default function PortalPatientLabsPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [data, setData] = useState<PortalPatientLabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadLabs() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/portal/patients/${params.patientId}/labs`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalPatientLabsResponse
          | { error?: { message?: string }; message?: string }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : body && "message" in body
                ? body.message
                : "Unable to load labs",
          );
        }

        setData(body.data);
        setSelectedSeriesId((current) =>
          current && body.data.chartSeries.some((series) => series.id === current)
            ? current
            : body.data.chartSeries[0]?.id ?? null,
        );
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          nextError instanceof Error ? nextError.message : "Unable to load labs",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLabs();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  const selectedSeries =
    data?.chartSeries.find((series) => series.id === selectedSeriesId) ??
    data?.chartSeries[0] ??
    null;
  const chartData = useMemo(
    () =>
      (selectedSeries?.points ?? []).map((point) => ({
        ...point,
        label: formatDisplayDate(point.at, { fallback: "", includeTime: false }),
      })),
    [selectedSeries],
  );
  const rangeBounds = useMemo(() => {
    const lows = chartData
      .map((point) => point.rangeLow)
      .filter((value): value is number => typeof value === "number");
    const highs = chartData
      .map((point) => point.rangeHigh)
      .filter((value): value is number => typeof value === "number");
    return {
      high: highs.length ? highs[0] : null,
      low: lows.length ? lows[0] : null,
    };
  }, [chartData]);

  if (status === "loading" || loading) {
    return <PortalLoadingState label="Loading lab results..." />;
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <Link className={styles.inlineLink} href="/portal">
          Back to portal
        </Link>
        <h2>Lab results unavailable</h2>
        <p>{error ?? "The requested lab results could not be loaded."}</p>
      </section>
    );
  }

  const patientHref = `/portal/patients/${data.patient.id}`;

  return (
    <section className={styles.subpageLayout}>
      <PortalPatientSubpageHeader
        backHref={patientHref}
        backLabel="Back to patient"
        headline={data.headline}
      />

      <section className={styles.dataScreenCard}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h2 className={styles.dataScreenTitle}>Lab trend</h2>
            <p className={styles.dataScreenCaption}>
              One lab at a time, with the reference range shown as a background band.
            </p>
          </div>
          {data.chartSeries.length > 0 ? (
            <label className={styles.nutritionFilterControl}>
              <span className={styles.visuallyHidden}>Selected lab trend</span>
              <select
                className={styles.nutritionFilterSelect}
                onChange={(event) => setSelectedSeriesId(event.target.value)}
                value={selectedSeries?.id ?? ""}
              >
                {data.chartSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className={styles.chartCard}>
          {selectedSeries ? (
            <>
              <div className={styles.tableSubtleText}>
                {selectedSeries.unit ? `Unit: ${selectedSeries.unit}` : "Unit not recorded"}
                {selectedSeries.rangeLabel ? ` • Range ${selectedSeries.rangeLabel}` : ""}
              </div>
              <div className={styles.chartInteractiveFrame}>
                <ResponsiveContainer height={250} width="100%">
                  <LineChart
                    data={chartData}
                    margin={{ bottom: 0, left: 8, right: 24, top: 16 }}
                  >
                    <CartesianGrid
                      stroke="#d8e1ea"
                      strokeDasharray="0"
                      vertical={false}
                    />
                    {rangeBounds.low !== null && rangeBounds.high !== null ? (
                      <ReferenceArea
                        fill="#e7f4ea"
                        fillOpacity={0.85}
                        y1={rangeBounds.low}
                        y2={rangeBounds.high}
                      />
                    ) : null}
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      minTickGap={24}
                      tick={{ fill: "#5d748a", fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      tick={{ fill: "#5d748a", fontSize: 12 }}
                      tickLine={false}
                      width={64}
                    />
                    <Tooltip
                      formatter={(value) =>
                        `${value}${selectedSeries.unit ? ` ${selectedSeries.unit}` : ""}`
                      }
                      labelFormatter={(value) => `Taken ${value}`}
                    />
                    <Line
                      dataKey="value"
                      dot={({ cx, cy, payload }) => {
                        if (
                          typeof cx !== "number" ||
                          typeof cy !== "number" ||
                          !payload
                        ) {
                          return null;
                        }
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            fill={dotColor(payload.abnormalFlag)}
                            r={4}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        );
                      }}
                      stroke="#0b63b6"
                      strokeWidth={2.5}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className={styles.patientPanelEmpty}>
              No numeric lab history is available to chart yet.
            </div>
          )}
        </div>
      </section>

      <article className={styles.detailCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.dataScreenTitle}>Lab summary</h3>
        </div>
        <div className={styles.cardBody}>
          <dl className={styles.detailFacts}>
            <div>
              <dt>Current labs</dt>
              <dd>{data.summary.totalCurrent}</dd>
            </div>
            <div>
              <dt>Tracked labs</dt>
              <dd>{data.summary.trackedCount}</dd>
            </div>
            <div>
              <dt>Abnormal</dt>
              <dd>{data.summary.abnormalCount}</dd>
            </div>
            <div>
              <dt>Critical</dt>
              <dd>{data.summary.criticalCount}</dd>
            </div>
            <div>
              <dt>Last reported</dt>
              <dd>
                {formatDisplayDate(data.summary.lastReportedAt, {
                  fallback: "Not recorded",
                  includeTime: true,
                })}
              </dd>
            </div>
          </dl>
        </div>
      </article>

      <section className={styles.dataScreenCard}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h2 className={styles.dataScreenTitle}>Current lab values</h2>
            <p className={styles.dataScreenCaption}>
              Latest materialised lab state for this patient, with abnormal flags
              and reference ranges where available.
            </p>
          </div>
        </div>
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <caption className={styles.visuallyHidden}>Current lab values</caption>
            <thead>
              <tr>
                <th scope="col">Lab</th>
                <th scope="col">Value</th>
                <th scope="col">Range</th>
                <th scope="col">Status</th>
                <th scope="col">Taken</th>
              </tr>
            </thead>
            <tbody>
              {data.currentLabs.length ? (
                data.currentLabs.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.label}</strong>
                      <div className={styles.tableSubtleText}>
                        {row.code || "No code"}
                        {row.isTracked ? " • tracked lab" : ""}
                      </div>
                    </td>
                    <td>
                      {row.value}
                      {row.unit ? ` ${row.unit}` : ""}
                    </td>
                    <td>{row.rangeLabel ?? "No reference range"}</td>
                    <td>{formatLabFlag(row.abnormalFlag)}</td>
                    <td>{formatDisplayDate(row.takenAt, { fallback: "Not recorded" })}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No current lab results were found for this patient.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.dataScreenCard}>
        <div className={styles.dataScreenToolbar}>
          <div>
            <h2 className={styles.dataScreenTitle}>Recent lab history</h2>
            <p className={styles.dataScreenCaption}>
              Showing the {data.summary.historyShownCount} most recent ledger results,
              including corrected and preliminary entries.
            </p>
          </div>
        </div>
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <caption className={styles.visuallyHidden}>Recent lab history</caption>
            <thead>
              <tr>
                <th scope="col">When taken</th>
                <th scope="col">Lab</th>
                <th scope="col">Value</th>
                <th scope="col">Status</th>
                <th scope="col">Reported</th>
                <th scope="col">Flag</th>
              </tr>
            </thead>
            <tbody>
              {data.historyRows.length ? (
                data.historyRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {formatDisplayDate(row.takenAt, {
                        fallback: "Not recorded",
                        includeTime: true,
                      })}
                    </td>
                    <td>
                      <strong>{row.label}</strong>
                      <div className={styles.tableSubtleText}>{row.code || "No code"}</div>
                    </td>
                    <td>
                      {row.value}
                      {row.unit ? ` ${row.unit}` : ""}
                    </td>
                    <td>{row.status}</td>
                    <td>
                      {formatDisplayDate(row.reportedAt, {
                        fallback: "Not recorded",
                        includeTime: true,
                      })}
                    </td>
                    <td>{formatLabFlag(row.abnormalFlag)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No lab history recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
