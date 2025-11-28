import { DashboardRange, DashboardRatio } from "./types";

export function describeRange(range: DashboardRange) {
  if (!range.entries) {
    return `No meals logged in the last ${range.days} days`;
  }
  const from = formatDateShort(range.from);
  const to = formatDateShort(range.to);
  return `${range.entries} meals logged between ${from} and ${to}`;
}

export function formatDateShort(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatDecimal(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  if (decimals === 0) {
    return Math.round(value).toString();
  }
  return parseFloat(value.toFixed(decimals)).toString();
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ratioStatusLabel(status: DashboardRatio["status"]) {
  switch (status) {
    case "in-range":
      return "In range";
    case "high":
      return "Above target";
    default:
      return "No data";
  }
}

export function getStatusStyles(
  status: DashboardRatio["status"],
  theme: "light" | "dark"
) {
  if (status === "in-range") {
    return {
      pill: {
        backgroundColor:
          theme === "light" ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.25)",
      },
      text: { color: theme === "light" ? "#047857" : "#6EE7B7" },
    };
  }
  if (status === "high") {
    return {
      pill: {
        backgroundColor:
          theme === "light" ? "rgba(239,68,68,0.15)" : "rgba(248,113,113,0.3)",
      },
      text: { color: theme === "light" ? "#B91C1C" : "#FCA5A5" },
    };
  }
  return {
    pill: {
      backgroundColor:
        theme === "light" ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.35)",
    },
    text: { color: theme === "light" ? "#1F2937" : "#E5E7EB" },
  };
}
