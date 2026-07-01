"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import {
  PORTAL_HEALTH_METRICS,
  type PortalHealthMetric,
  type PortalPatientHealthData,
  type PortalPatientHealthRow,
} from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalPatientHealthResponse = {
  data: PortalPatientHealthData;
};

const HEALTH_METRIC_LABELS: Record<PortalHealthMetric, string> = {
  blood_pressure: "Blood pressure",
  symptoms: "Symptoms",
  weight: "Weight",
};

function formatValue(value: number, unit: string) {
  const maximumFractionDigits = unit === "kg" ? 1 : 0;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits })} ${unit}`;
}

export default function PortalPatientHealthPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [metric, setMetric] = useState<PortalHealthMetric>("blood_pressure");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [data, setData] = useState<PortalPatientHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 });

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadHealthData() {
      if (!data) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const searchParams = new URLSearchParams({
          days: "365",
          metric,
        });
        if (selectedMonth) {
          searchParams.set("month", selectedMonth);
        }

        const response = await fetch(
          `/api/portal/patients/${params.patientId}/health?${searchParams.toString()}`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalPatientHealthResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load health data",
          );
        }

        setData(body.data);
        setSelectedMonth(body.data.selectedMonth);
        setPagination((current) => ({ ...current, pageIndex: 0 }));
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load health data",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadHealthData();
    return () => controller.abort();
  }, [metric, params.patientId, selectedMonth, session, status]);

  const columns = useMemo<ColumnDef<PortalPatientHealthRow>[]>(
    () => [
      {
        accessorKey: "label",
        cell: ({ row }) => row.original.label,
        header: data?.series.rowLabel ?? "Period",
      },
      {
        accessorKey: "primaryValue",
        cell: ({ row }) =>
          formatValue(
            row.original.primaryValue,
            data?.series.primaryUnit ?? "",
          ),
        header: data?.series.primaryLabel ?? "Primary",
      },
      ...(data?.series.secondaryLabel
        ? [
            {
              accessorKey: "secondaryValue",
              cell: ({ row }: { row: { original: PortalPatientHealthRow } }) =>
                row.original.secondaryValue !== null
                  ? formatValue(
                      row.original.secondaryValue,
                      data?.series.secondaryUnit ?? "",
                    )
                  : "—",
              header: data.series.secondaryLabel,
            } satisfies ColumnDef<PortalPatientHealthRow>,
          ]
        : []),
      ...(metric === "symptoms"
        ? [
            {
              accessorKey: "detail",
              cell: ({ row }: { row: { original: PortalPatientHealthRow } }) =>
                row.original.detail?.trim() || "—",
              header: "Latest note",
            } satisfies ColumnDef<PortalPatientHealthRow>,
          ]
        : []),
    ],
    [
      data?.series.primaryLabel,
      data?.series.primaryUnit,
      data?.series.rowLabel,
      data?.series.secondaryLabel,
      data?.series.secondaryUnit,
      metric,
    ],
  );

  const table = useReactTable({
    columns,
    data: data?.rows ?? [],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: { pagination },
  });

  if (status === "loading" || (loading && !data)) {
    return (
      <section className={styles.emptyState}>Loading health data...</section>
    );
  }

  if (!data || error) {
    return (
      <section className={styles.emptyState}>
        <Link
          className={styles.inlineLink}
          href={`/portal/patients/${params.patientId}`}
        >
          &larr; Back to patient dashboard
        </Link>
        <h2>Health data unavailable</h2>
        <p>{error ?? "The requested health data could not be loaded."}</p>
      </section>
    );
  }

  return (
    <section className={styles.subpageLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${data.patient.id}`}
        backLabel="Back to patient dashboard"
        headline={data.headline}
      />

      <section className={styles.nutritionInsightLayout}>
        <div className={styles.nutritionInsightHeader}>
          <div className={styles.nutritionInsightTitleBlock}>
            <h2 className={styles.nutritionInsightTitle}>{data.summaryTitle}</h2>
            {refreshing ? (
              <p className={styles.dataScreenCaption}>
                Updating selected month...
              </p>
            ) : null}
          </div>
          <label className={styles.nutritionFilterControl}>
            <span className={styles.visuallyHidden}>Health metric</span>
            <select
              className={styles.nutritionFilterSelect}
              onChange={(event) => {
                setMetric(event.target.value as PortalHealthMetric);
                setSelectedMonth(null);
              }}
              value={metric}
            >
              {PORTAL_HEALTH_METRICS.map((option) => (
                <option key={option} value={option}>
                  {HEALTH_METRIC_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartInteractiveFrame}>
            <ResponsiveContainer height={360} width="100%">
              <BarChart
                data={data.monthlyStats}
                margin={{ bottom: 0, left: 8, right: 24, top: 24 }}
              >
                <CartesianGrid
                  stroke="#d8e1ea"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#6a7b8e", fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: "#6a7b8e", fontSize: 12 }}
                  tickFormatter={(value) => `${value}`}
                  width={56}
                />
                <Tooltip
                  formatter={(value, _name, entry) =>
                    formatValue(
                      Number(value),
                      entry.dataKey === "secondaryValue"
                        ? data.series.secondaryUnit ?? ""
                        : data.series.primaryUnit,
                    )
                  }
                />
                <Bar dataKey="primaryValue" fill="#0a66b7" radius={[2, 2, 0, 0]}>
                  {data.monthlyStats.map((item) => (
                    <Cell
                      fill={item.isSelected ? "#0a66b7" : "#6ba8db"}
                      key={`primary-${item.month}`}
                    />
                  ))}
                </Bar>
                {metric === "blood_pressure" ? (
                  <Bar
                    dataKey="secondaryValue"
                    fill="#6c7a89"
                    radius={[2, 2, 0, 0]}
                  >
                    {data.monthlyStats.map((item) => (
                      <Cell
                        fill={item.isSelected ? "#6c7a89" : "#b6c3cf"}
                        key={`secondary-${item.month}`}
                      />
                    ))}
                  </Bar>
                ) : null}
              </BarChart>
            </ResponsiveContainer>

            <div className={styles.chartMonthOverlay}>
              {data.monthlyStats.map((item) => (
                <button
                  aria-label={`Select ${item.label}`}
                  className={styles.chartMonthButton}
                  key={item.month}
                  onClick={() => setSelectedMonth(item.month)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>

        <section className={styles.dataScreenCard}>
          <div className={styles.dataScreenToolbar}>
            <div>
              <h2 className={styles.dataScreenTitle}>{data.tableTitle}</h2>
              <p className={styles.dataScreenCaption}>
                Selected month: {data.selectedMonthLabel}
              </p>
            </div>
            <p className={styles.dataScreenCaption}>
              {data.rows.length} measurement rows across the last{" "}
              {data.window.days} days
            </p>
          </div>

          {data.rows.length === 0 ? (
            <div className={styles.emptyState}>
              No {HEALTH_METRIC_LABELS[metric].toLowerCase()} data was recorded
              for {data.selectedMonthLabel}.
            </div>
          ) : (
            <>
              <div className={styles.dataTableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} scope="col">
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.tablePagination}>
                <div className={styles.tablePaginationMeta}>
                  Showing {table.getRowModel().rows.length} of {data.rows.length} rows
                </div>
                <div className={styles.tablePaginationActions}>
                  <button
                    className={styles.buttonSecondary}
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </section>
  );
}
