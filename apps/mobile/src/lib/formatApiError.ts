type ApiErrorBody = {
  message?: string;
  errors?: unknown;
};

function collectErrors(node: any, path: string[] = []): string[] {
  if (node == null) return [];

  if (typeof node === "string" || typeof node === "number") {
    return [`${path.length ? path.join(" → ") : "form"}: ${node}`];
  }

  if (typeof node !== "object") return [];

  const lines: string[] = [];
  if (Array.isArray((node as any)._errors)) {
    for (const msg of (node as any)._errors) {
      lines.push(`${path.length ? path.join(" → ") : "form"}: ${msg}`);
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "_errors") continue;
    lines.push(...collectErrors((node as any)[key], [...path, key]));
  }

  return lines;
}

export function formatApiError(status: number, body?: ApiErrorBody | null) {
  const base =
    body?.message?.trim() || `Request failed (${status.toString()})`;
  if (!body?.errors) return base;

  const details = collectErrors(body.errors);
  return details.length ? `${base}\n\n${details.join("\n")}` : base;
}
