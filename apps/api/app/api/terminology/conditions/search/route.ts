export const runtime = "nodejs";

import { ROLES } from "@ckd/core";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad, ok } from "@/apps/api/lib/http/responses";

const TOKEN_URL =
  "https://ontology.nhs.uk/authorisation/auth/realms/nhs-digital-terminology/protocol/openid-connect/token";
const FHIR_BASE_URL = process.env.NHS_TERMINOLOGY_FHIR_BASE_URL;
const CONDITION_VALUESET_URL = "http://snomed.info/sct?fhir_vs=ecl/<404684003";

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
  results: Array<{ code: string; display: string; system: string }> = [],
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

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

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
    const url = new URL(`${FHIR_BASE_URL}/ValueSet/$expand`);
    url.searchParams.set("url", CONDITION_VALUESET_URL);
    url.searchParams.set("filter", query);
    url.searchParams.set("count", String(limit));
    console.log("health ledger");

    const response = await fetch(url, {
      headers: {
        Accept: "application/fhir+json, application/json",
        Authorization: `Bearer ${token}`,
      },
      method: "GET",
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      const operationOutcomeMessage = extractOperationOutcomeMessage(message);
      console.error("NHS terminology FHIR request failed", {
        operationOutcomeMessage,
        query,
        requestUrl: url.toString(),
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
    const items = flattenContains(data.expansion?.contains)
      .slice(0, limit)
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
