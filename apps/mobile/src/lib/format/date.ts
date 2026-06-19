type MobileDateFormatOptions = {
  fallback?: string;
  includeTime?: boolean;
};

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMobileDate(
  value: string | Date | null | undefined,
  options: MobileDateFormatOptions = {},
) {
  const { fallback = "Not set", includeTime = false } = options;
  const date = toDate(value);
  if (!date) return fallback;

  return includeTime
    ? date.toLocaleString("en-GB")
    : date.toLocaleDateString("en-GB");
}

export function formatMobileUkInputDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toMobileUtcDateIso(value: Date) {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  ).toISOString();
}

export function formatMobileShortDayMonth(
  value: string | Date | null | undefined,
  options: { fallback?: string } = {},
) {
  const { fallback = "" } = options;
  const date = toDate(value);
  if (!date) return fallback;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}
