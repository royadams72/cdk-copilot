export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad, ok } from "@/apps/api/lib/http/responses";

const TOKEN_URL =
  "https://ontology.nhs.uk/authorisation/auth/realms/nhs-digital-terminology/protocol/openid-connect/token";
const FHIR_BASE_URL = process.env.NHS_TERMINOLOGY_FHIR_BASE_URL;
const CONDITION_VALUESET_URL = "http://snomed.info/sct?fhir_vs=ecl%2F404684003";
const CONDITION_DESCENDANTS_VALUE_SET = {
  resourceType: "ValueSet" as const,
  compose: {
    include: [
      {
        system: "http://snomed.info/sct",
        filter: [
          {
            property: "concept",
            op: "is-a",
            value: "404684003",
          },
        ],
      },
    ],
  },
};

type TerminologyExpandResponse = {
  expansion?: {
    contains?: TerminologyContainsItem[];
  };
};

type TerminologyContainsItem = {
  code?: string;
  contains?: TerminologyContainsItem[];
  display?: string;
  system?: string;
};

type FhirOperationOutcome = {
  issue?: Array<{
    code?: string;
    details?: { text?: string };
    diagnostics?: string;
    severity?: string;
  }>;
  resourceType?: string;
};

type ConditionSearchResult = {
  code: string;
  display: string;
  system: string;
};

const EXCLUDED_LABEL_PATTERNS = [
  /\bdiet\b/i,
  /\bprogramme\b/i,
  /\bprogram\b/i,
  /\bdistress\b/i,
  /\bresolved\b/i,
  /\bremission\b/i,
  /\bscreening\b/i,
  /\beducation\b/i,
  /\btherapy\b/i,
  /\bmonitoring\b/i,
  /\bassessment\b/i,
  /\breferral\b/i,
  /\bcare plan\b/i,
  /\bprocedure\b/i,
  /\bsituation\b/i,
];

const PREFERRED_LABEL_PATTERNS = [
  /\bdisorder\b/i,
  /\bdisease\b/i,
  /\bsyndrome\b/i,
  /\bfinding\b/i,
  /\bmellitus\b/i,
  /\bhypertension\b/i,
  /\bdiabetes\b/i,
];

function getClientCredentials() {
  const clientId = process.env.NHS_TERMINOLOGY_CLIENT_ID;
  const clientSecret = process.env.NHS_TERMINOLOGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw Object.assign(
      new Error("NHS terminology server credentials are not configured"),
      { status: 500 },
    );
  }

  return { clientId, clientSecret };
}

function extractOperationOutcomeMessage(bodyText: string) {
  try {
    const parsed = JSON.parse(bodyText) as FhirOperationOutcome;
    if (parsed.resourceType !== "OperationOutcome") return null;
    const firstIssue = parsed.issue?.[0];
    return (
      firstIssue?.diagnostics ??
      firstIssue?.details?.text ??
      (firstIssue?.code ? `Terminology server error: ${firstIssue.code}` : null)
    );
  } catch {
    return null;
  }
}

function truncateForLog(value: string, max = 800) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function isMissingImplicitValueSetError(message: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find value set") &&
    normalized.includes("http://snomed.info/sct?fhir_vs=ecl")
  );
}

async function getAccessToken() {
  const { clientId, clientSecret } = getClientCredentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(TOKEN_URL, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error("NHS terminology token request failed", {
      responseText: truncateForLog(responseText),
      status: response.status,
      statusText: response.statusText,
      tokenUrl: TOKEN_URL,
    });
    throw Object.assign(
      new Error(
        `Failed to obtain terminology access token (${response.status} ${response.statusText})${
          responseText ? `: ${responseText}` : ""
        }`,
      ),
      {
        status: 502,
      },
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw Object.assign(
      new Error(
        `Terminology access token missing${
          data.error
            ? `: ${data.error}${data.error_description ? ` - ${data.error_description}` : ""}`
            : ""
        }`,
      ),
      {
        status: 502,
      },
    );
  }

  return data.access_token;
}

function flattenContains(
  contains: TerminologyContainsItem[] | undefined,
  results: ConditionSearchResult[] = [],
) {
  for (const item of contains ?? []) {
    if (item.code && item.display) {
      results.push({
        code: item.code,
        display: item.display,
        system: item.system ?? "http://snomed.info/sct",
      });
    }
    if (item.contains?.length) {
      flattenContains(item.contains, results);
    }
  }
  return results;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeConditionSearchScore(item: ConditionSearchResult, query: string) {
  const label = item.display;
  const normalizedLabel = normalizeText(label);
  const normalizedQuery = normalizeText(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);

  let score = 0;

  if (normalizedLabel === normalizedQuery) score += 200;
  if (normalizedLabel.startsWith(normalizedQuery)) score += 120;
  if (normalizedLabel.includes(` ${normalizedQuery}`)) score += 90;
  if (normalizedLabel.includes(normalizedQuery)) score += 60;

  for (const term of terms) {
    if (normalizedLabel.startsWith(term)) score += 25;
    else if (normalizedLabel.includes(` ${term}`)) score += 18;
    else if (normalizedLabel.includes(term)) score += 10;
  }

  for (const pattern of PREFERRED_LABEL_PATTERNS) {
    if (pattern.test(label)) score += 12;
  }

  for (const pattern of EXCLUDED_LABEL_PATTERNS) {
    if (pattern.test(label)) score -= 80;
  }

  if (/\(.+\)$/.test(label)) score -= 5;

  return score;
}

function rankConditionResults(items: ConditionSearchResult[], query: string, limit: number) {
  const deduped = new Map<string, ConditionSearchResult>();

  for (const item of items) {
    const labelKey = normalizeText(item.display);
    if (!labelKey) continue;
    if (EXCLUDED_LABEL_PATTERNS.some((pattern) => pattern.test(item.display))) {
      continue;
    }
    if (!deduped.has(labelKey)) {
      deduped.set(labelKey, item);
    }
  }

  return Array.from(deduped.values())
    .map((item) => ({
      item,
      score: computeConditionSearchScore(item, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.display.localeCompare(b.item.display))
    .slice(0, limit)
    .map(({ item }) => item);
}

async function expandValueSetWithCanonicalUrl(
  token: string,
  query: string,
  limit: number,
) {
  const url = new URL(`${FHIR_BASE_URL}/ValueSet/$expand`);
  url.searchParams.set("url", CONDITION_VALUESET_URL);
  url.searchParams.set("filter", query);
  url.searchParams.set("count", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/fhir+json, application/json",
      Authorization: `Bearer ${token}`,
      Prefer: "return=representation",
    },
    method: "GET",
  });

  return { response, requestDescription: url.toString() };
}

async function expandValueSetWithExplicitCompose(
  token: string,
  query: string,
  limit: number,
) {
  const url = new URL(`${FHIR_BASE_URL}/ValueSet/$expand`);
  const body = {
    resourceType: "Parameters" as const,
    parameter: [
      {
        name: "valueSet",
        resource: CONDITION_DESCENDANTS_VALUE_SET,
      },
      {
        name: "filter",
        valueString: query,
      },
      {
        name: "count",
        valueInteger: limit,
      },
    ],
  };

  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/fhir+json, application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/fhir+json",
      Prefer: "return=representation",
    },
    method: "POST",
  });

  return { response, requestDescription: `${url.toString()} [explicit ValueSet]` };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);

    const query = req.nextUrl.searchParams.get("query")?.trim() ?? "";
    if (!query) return ok({ items: [] });

    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 8);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(20, Math.floor(limitRaw)))
      : 8;

    if (!FHIR_BASE_URL) {
      return bad(
        "NHS terminology FHIR base URL is not configured",
        undefined,
        500,
      );
    }

    const token = await getAccessToken();
    let { response, requestDescription } =
      await expandValueSetWithCanonicalUrl(token, query, limit);

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      const operationOutcomeMessage = extractOperationOutcomeMessage(message);

      if (isMissingImplicitValueSetError(operationOutcomeMessage || message)) {
        ({ response, requestDescription } =
          await expandValueSetWithExplicitCompose(token, query, limit));
      } else {
        console.error("NHS terminology FHIR request failed", {
          operationOutcomeMessage,
          query,
          requestUrl: requestDescription,
          responseText: truncateForLog(message),
          status: response.status,
          statusText: response.statusText,
        });
        throw Object.assign(
          new Error(
            operationOutcomeMessage ||
              message ||
              "Terminology search request failed",
          ),
          { status: 502 },
        );
      }
    }

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      const operationOutcomeMessage = extractOperationOutcomeMessage(message);
      console.error("NHS terminology FHIR request failed", {
        operationOutcomeMessage,
        query,
        requestUrl: requestDescription,
        responseText: truncateForLog(message),
        status: response.status,
        statusText: response.statusText,
      });
      throw Object.assign(
        new Error(
          operationOutcomeMessage ||
            message ||
            "Terminology search request failed",
        ),
        { status: 502 },
      );
    }

    const data = (await response.json()) as TerminologyExpandResponse;
    const items = rankConditionResults(
      flattenContains(data.expansion?.contains),
      query,
      limit,
    )
      .map((item) => ({
        code: item.code,
        codeSystem: "SNOMED_CT" as const,
        label: item.display,
        system: item.system,
      }));

    return ok({ items });
  } catch (err: any) {
    const status = err?.status || 500;
    const message = err?.message || "Server error";
    const userMessage =
      status >= 500 ? "Condition search is temporarily unavailable" : message;
    return bad(userMessage, { detail: message }, status);
  }
}
