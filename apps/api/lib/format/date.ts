type DateDisplayOptions = {
  fallback?: string | null;
  includeTime?: boolean;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

export function formatDisplayDate(
  value: Date | string | null | undefined,
  options: DateDisplayOptions = {},
) {
  const { fallback = "Not set", includeTime = false } = options;
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-GB", {
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDisplayDob(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
