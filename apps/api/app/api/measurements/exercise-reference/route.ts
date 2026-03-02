export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";

type ExerciseRefDoc = {
  category: string;
  exerciseId: string;
  intensity: "light" | "moderate" | "vigorous";
  met: number;
  name: string;
};

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const db = await getDb();
    const docs = await db
      .collection<ExerciseRefDoc>(COLLECTIONS.ExerciseReference)
      .find(
        {},
        {
          projection: {
            _id: 0,
            category: 1,
            exerciseId: 1,
            intensity: 1,
            met: 1,
            name: 1,
          },
        },
      )
      .sort({ category: 1, intensity: 1, name: 1 })
      .toArray();

    const grouped = docs.reduce<Record<string, ExerciseRefDoc[]>>((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    const categories = Object.entries(grouped).map(([category, items]) => ({
      category,
      items,
    }));

    return ok({ categories });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
