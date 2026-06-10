import {
  CreateSymptomRequest,
  SymptomEntry,
  UpdateSymptomRequest,
} from "@ckd/core";

import {
  assertValidStatusTransition,
  buildSymptomHistoryGroups,
  determineTrendDirection,
  normalizeSymptomName,
} from "../lib/utils/symptoms";

describe("symptoms", () => {
  it("accepts valid structured symptom input", () => {
    expect(
      CreateSymptomRequest.parse({
        name: "Fatigue",
        note: "Worse after lunch",
        recordedAt: "2026-06-10T11:00:00.000Z",
        severity: 4,
        startedAt: "2026-06-10T09:00:00.000Z",
        status: "active",
        triggers: ["after lunch", "walking"],
      }),
    ).toMatchObject({
      name: "Fatigue",
      severity: 4,
      status: "active",
    });
  });

  it("rejects invalid symptom snapshots", () => {
    expect(() =>
      SymptomEntry.parse({
        createdAt: "2026-06-10T11:00:00.000Z",
        createdBy: {
          actorType: "patient",
          principalId: "pr_patient_1",
        },
        name: "Fatigue",
        normalizedName: "fatigue",
        patientId: "665f85cb40457089f5b75f9a",
        recordedAt: "2026-06-10T11:00:00.000Z",
        severity: 4,
        source: "patient",
        status: "resolved",
        symptomId: "sym_1",
        triggers: [],
        updatedAt: "2026-06-10T11:00:00.000Z",
        updatedBy: {
          actorType: "patient",
          principalId: "pr_patient_1",
        },
      }),
    ).toThrow("resolved symptoms must include resolvedAt");
  });

  it("rejects empty updates", () => {
    expect(() => UpdateSymptomRequest.parse({})).toThrow(
      "At least one field must be supplied",
    );
  });

  it("rejects resolved to improving transitions", () => {
    expect(() =>
      assertValidStatusTransition("resolved", "improving"),
    ).toThrow("Resolved symptoms must be reopened as active before improving");
  });

  it("normalizes names and builds grouped history with trend counts", () => {
    const groups = buildSymptomHistoryGroups([
      {
        _id: "1",
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        createdBy: { actorType: "patient", principalId: "pr_patient_1" },
        name: "Fatigue",
        normalizedName: normalizeSymptomName("Fatigue"),
        note: "Needed a nap",
        orgId: "org_1",
        patientId: "665f85cb40457089f5b75f9a",
        recordedAt: new Date("2026-06-01T09:00:00.000Z"),
        resolvedAt: null,
        severity: 2,
        source: "patient",
        startedAt: null,
        status: "active",
        symptomId: "sym_1",
        triggers: ["walking"],
        updatedAt: new Date("2026-06-01T09:00:00.000Z"),
        updatedBy: { actorType: "patient", principalId: "pr_patient_1" },
      },
      {
        _id: "2",
        createdAt: new Date("2026-06-08T09:00:00.000Z"),
        createdBy: { actorType: "patient", principalId: "pr_patient_1" },
        name: "fatigue",
        normalizedName: normalizeSymptomName("fatigue"),
        note: "Worse this week",
        orgId: "org_1",
        patientId: "665f85cb40457089f5b75f9a",
        recordedAt: new Date("2026-06-08T09:00:00.000Z"),
        resolvedAt: null,
        severity: 4,
        source: "patient",
        startedAt: null,
        status: "active",
        symptomId: "sym_2",
        triggers: [],
        updatedAt: new Date("2026-06-08T09:00:00.000Z"),
        updatedBy: { actorType: "patient", principalId: "pr_patient_1" },
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      latestNote: "Worse this week",
      latestSeverity: 4,
      name: "fatigue",
      normalizedName: "fatigue",
      trendDirection: "up",
    });
    expect(groups[0].last30dCount).toBe(2);
  });

  it("detects flat trend when severities do not change", () => {
    expect(
      determineTrendDirection([
        { recordedAt: new Date("2026-06-01T09:00:00.000Z"), severity: 3 },
        { recordedAt: new Date("2026-06-02T09:00:00.000Z"), severity: 3 },
      ]),
    ).toBe("flat");
  });
});
