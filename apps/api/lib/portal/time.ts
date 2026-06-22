export function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

export function buildChartMonths(currentMonthStart: Date, count = 12) {
  return Array.from({ length: count }, (_, offset) =>
    monthKey(addMonths(currentMonthStart, offset - (count - 1))),
  );
}

export function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date).toUpperCase();
}

export function formatMonthLongLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}
