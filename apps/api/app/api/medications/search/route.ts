export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

function normalizeTerm(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    const normalized = normalizeTerm(query);
    if (!normalized) return ok({ items: [] });

    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 8);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(20, Math.floor(limitRaw)))
      : 8;

    const db = await getDb();
    const prefix = `^${escapeRegex(normalized)}`;
    const rx = new RegExp(prefix, "i");
    const items = await db
      .collection(COLLECTIONS.DrugsRef)
      .find(
        {
          // Backward-compatible: older/manual docs may omit isActive.
          isActive: { $ne: false },
          $or: [{ nameNorm: rx }, { synonymsNorm: rx }],
        },
        {
          projection: {
            _id: 1,
            name: 1,
            displayName: 1,
            dmplusdCode: 1,
            snomedCode: 1,
            form: 1,
            route: 1,
          },
        }
      )
      .limit(limit)
      .toArray();

    return ok({
      items: items.map((item: any) => ({
        id: item._id.toString(),
        name: item.name ?? "",
        displayName: item.displayName ?? item.name ?? "",
        dmplusdCode: item.dmplusdCode ?? null,
        snomedCode: item.snomedCode ?? null,
        form: item.form ?? null,
        route: item.route ?? null,
      })),
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
