import {
  getStepSummaryFromEntries,
  sortEntriesForTrendDay,
} from "@/screens/fitness/metricTrendUtils";

const duplicateDay = [
  {
    canDelete: false,
    canEdit: false,
    caloriesKcal: 0,
    distanceMeters: 0,
    entryId: "provisional-zero",
    measuredAt: "2026-09-11T07:06:56.458Z",
    source: "provider" as const,
    sync: {
      provider: "health_connect" as const,
      status: "provisional" as const,
    },
    value: 0,
    value2: null,
  },
  {
    canDelete: false,
    canEdit: false,
    caloriesKcal: 336.85,
    distanceMeters: 4377.77,
    entryId: "finalized-positive",
    measuredAt: "2026-09-11T11:00:00.000Z",
    source: "provider" as const,
    sync: {
      provider: "health_connect" as const,
      status: "finalized" as const,
    },
    value: 10240,
    value2: null,
  },
];

describe("step trend selection", () => {
  it("uses the finalized positive reading when provider changes created a duplicate", () => {
    expect(sortEntriesForTrendDay("steps", duplicateDay)[0]?.value).toBe(10240);
    expect(getStepSummaryFromEntries(duplicateDay).steps).toBe(10240);
  });
});
