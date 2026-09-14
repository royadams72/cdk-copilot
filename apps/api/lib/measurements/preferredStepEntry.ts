type StepEntry = {
  measuredAt: string;
  sync?: { status: "provisional" | "finalized" };
  value: number | null;
};

function priority(entry: StepEntry) {
  const positive = typeof entry.value === "number" && entry.value > 0;
  const finalized = entry.sync?.status === "finalized";
  if (finalized && positive) return 4;
  if (positive) return 3;
  if (finalized) return 2;
  return 1;
}

export function preferredStepEntry<T extends StepEntry>(entries: T[]) {
  return entries.reduce<T | undefined>((preferred, entry) => {
    if (!preferred) return entry;
    const priorityDiff = priority(entry) - priority(preferred);
    if (priorityDiff !== 0) return priorityDiff > 0 ? entry : preferred;
    return entry.measuredAt > preferred.measuredAt ? entry : preferred;
  }, undefined);
}
