"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import {
  PORTAL_NUTRITION_FILTERS,
  type PortalNutritionFilter,
  type PortalPatientNutritionData,
  type PortalPatientNutritionFoodRow,
} from "@/apps/api/lib/portal/patient-shared";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PortalPatientNutritionResponse = {
  data: PortalPatientNutritionData;
};

const NUTRITION_FILTER_LABELS: Record<PortalNutritionFilter, string> = {
  caloriesKcal: "Calories",
  phosphorusMg: "Phosphorus",
  potassiumMg: "Potassium",
  proteinG: "Protein",
  sodiumMg: "Sodium",
};

const NUTRITION_FILTER_UNITS: Record<PortalNutritionFilter, string> = {
  caloriesKcal: "kcal",
  phosphorusMg: "mg",
  potassiumMg: "mg",
  proteinG: "g",
  sodiumMg: "mg",
};

function formatAmount(value: number, filter: PortalNutritionFilter) {
  const maximumFractionDigits = filter === "proteinG" ? 1 : 0;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits })} ${
    NUTRITION_FILTER_UNITS[filter]
  }`;
}

function formatTrend(value: PortalPatientNutritionFoodRow["trend"]) {
  if (value === "increased") return "↑ Increased";
  if (value === "reduced") return "↓ Reduced";
  return "Same";
}

export default function PortalPatientNutritionPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalSession();
  const [filter, setFilter] = useState<PortalNutritionFilter>("phosphorusMg");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [data, setData] = useState<PortalPatientNutritionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 6 });
  const effectiveSelectedMonth = selectedMonth ?? data?.selectedMonth ?? null;
  const selectedMonthStat =
    data?.monthlyStats.find((item) => item.month === effectiveSelectedMonth) ??
    data?.monthlyStats.find((item) => item.target !== null) ??
    null;
  const selectedTarget = selectedMonthStat?.target ?? null;
  const chartMax = Math.max(
    1,
    ...(data?.monthlyStats.map((item) => item.value) ?? [0]),
    selectedTarget ?? 0,
  );

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) {
      return;
    }

    const authenticatedSession = session;
    const controller = new AbortController();

    async function loadNutritionData() {
      if (!data) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const searchParams = new URLSearchParams({
          days: "365",
          filter,
        });
        if (selectedMonth) {
          searchParams.set("month", selectedMonth);
        }

        const response = await fetch(
          `/api/portal/patients/${params.patientId}/nutrition?${searchParams.toString()}`,
          {
            headers: getPortalSessionAuthHeaders(authenticatedSession.jwt),
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | PortalPatientNutritionResponse
          | { error?: { message?: string } }
          | null;

        if (!response.ok || !body || !("data" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error?.message
              : "Unable to load nutrition data",
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
            : "Unable to load nutrition data",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadNutritionData();
    return () => controller.abort();
  }, [filter, selectedMonth, params.patientId, session, status]);

  const columns: ColumnDef<PortalPatientNutritionFoodRow>[] = [
    {
      accessorKey: "food",
      header: "Food",
    },
    {
      accessorKey: "timesLogged",
      cell: ({ row }) => `${row.original.timesLogged} times`,
      header: "Times logged",
    },
    {
      accessorKey: "levelLabel",
      header: `Estimated ${NUTRITION_FILTER_LABELS[filter].toLowerCase()}`,
    },
    {
      accessorKey: "trend",
      cell: ({ row }) => formatTrend(row.original.trend),
      header: "Trend",
    },
  ];

  const table = useReactTable({
    columns,
    data: data?.foodRows ?? [],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: { pagination },
  });

  if (status === "loading" || (loading && !data)) {
    return (
      <section className={styles.emptyState}>Loading nutrition data...</section>
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
        <h2>Nutrition data unavailable</h2>
        <p>{error ?? "The requested nutrition data could not be loaded."}</p>
      </section>
    );
  }

  return (
    <section className={styles.subpageLayout}>
      <div className={styles.patientHeadlineContainer}>
        <Link
          className={styles.patientBackLink}
          href={`/portal/patients/${data.patient.id}`}
        >
          &larr; Back to patient dashboard
        </Link>
        <div className={styles.patientHeadline}>
          <span aria-hidden="true" className={styles.patientHeadlineIcon}>
            <span className={styles.patientHeadlineAvatarHead} />
            <span className={styles.patientHeadlineAvatarBody} />
          </span>
          <div className={styles.patientHeadlineContent}>
            <div className={styles.patientHeadlineRow}>
              <div className={styles.patientHeadlineText}>{data.headline}</div>
            </div>
          </div>
        </div>
        <span aria-hidden="true" className={styles.patientBackLinkSpacer}>
          Back to patient dashboard
        </span>
      </div>

      <section className={styles.nutritionInsightLayout}>
        <div className={styles.nutritionInsightHeader}>
          <div className={styles.nutritionInsightTitleBlock}>
            <h2 className={styles.nutritionInsightTitle}>
              {data.summaryTitle}
            </h2>
            {refreshing ? (
              <p className={styles.dataScreenCaption}>
                Updating selected month...
              </p>
            ) : null}
          </div>
          <label className={styles.nutritionFilterControl}>
            <span className={styles.visuallyHidden}>Nutrition filter</span>
            <select
              className={styles.nutritionFilterSelect}
              onChange={(event) => {
                setFilter(event.target.value as PortalNutritionFilter);
                setSelectedMonth(null);
              }}
              value={filter}
            >
              {PORTAL_NUTRITION_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {NUTRITION_FILTER_LABELS[option]}
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
                  domain={[0, chartMax]}
                  tick={{ fill: "#6a7b8e", fontSize: 12 }}
                  tickFormatter={(value) => `${value}`}
                  width={56}
                />
                <Tooltip
                  formatter={(value) => formatAmount(Number(value), filter)}
                  labelFormatter={(value) => `Month: ${value}`}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {data.monthlyStats.map((item) => (
                    <Cell
                      fill={
                        item.month === effectiveSelectedMonth
                          ? "#ffb400"
                          : "#0a66b7"
                      }
                      key={item.month}
                    />
                  ))}
                </Bar>
                {selectedTarget !== null ? (
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    label={{
                      fill: "#4F46E5",
                      fontSize: 12,
                      value: "Target",
                    }}
                    stroke="#4F46E5"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    y={selectedTarget}
                  />
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
              {data.foodRows.length} food rows across the last{" "}
              {data.window.days} days
            </p>
            {selectedTarget !== null ? (
              <p className={styles.dataScreenCaption}>
                Target: {formatAmount(selectedTarget, filter)}
              </p>
            ) : null}
          </div>

          {data.foodRows.length === 0 ? (
            <div className={styles.emptyState}>
              No nutrition food data was recorded for {data.selectedMonthLabel}.
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
                            {cell.column.columnDef.cell
                              ? flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )
                              : String(cell.getValue() ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.tablePagination}>
                <span className={styles.tablePaginationMeta}>
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {table.getPageCount()}
                </span>
                <div className={styles.tablePaginationActions}>
                  <button
                    className={styles.buttonGhost}
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    className={styles.buttonGhost}
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
