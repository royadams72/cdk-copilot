// Canonical patient assignment date storage is ISO string per TPatientAssignment.
// These helpers keep legacy BSON Date rows readable until the collection is backfilled.

export function buildExpiredAssignmentEndsAtFilter(now: Date) {
  const nowIso = now.toISOString();

  return {
    $or: [
      { endsAt: { $type: "date", $lte: now } },
      { endsAt: { $type: "string", $lte: nowIso } },
    ],
  } as const;
}

export function buildActiveAssignmentEndsAtFilter(now: Date) {
  const nowIso = now.toISOString();

  return {
    $or: [
      { endsAt: null },
      { endsAt: { $exists: false } },
      { endsAt: { $type: "date", $gt: now } },
      { endsAt: { $type: "string", $gt: nowIso } },
    ],
  } as const;
}
