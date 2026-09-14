import { preferredStepEntry } from "../lib/measurements/preferredStepEntry";

describe("preferredStepEntry", () => {
  it("prefers a finalized positive reading over an enriched provisional zero", () => {
    const selected = preferredStepEntry([
      {
        caloriesKcal: 0,
        distanceMeters: 0,
        measuredAt: "2026-09-11T07:06:56.458Z",
        sync: { status: "provisional" as const },
        value: 0,
      },
      {
        caloriesKcal: 336.85,
        distanceMeters: 4377.77,
        measuredAt: "2026-09-11T11:00:00.000Z",
        sync: { status: "finalized" as const },
        value: 10240,
      },
    ]);

    expect(selected?.value).toBe(10240);
  });
});
