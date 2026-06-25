import {
  CreateSymptomRequest,
  SymptomEntry,
  UpdateSymptomRequest,
} from "@ckd/core";

import {
  assertValidStatusTransition,
  buildSymptomHistoryGroups,
  buildSymptomActor,
  createPatientSymptom,
  determineTrendDirection,
  normalizeSymptomName,
  updatePatientSymptom,
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

  it("lifts recordedAt to startedAt when creating without an explicit recordedAt", async () => {
    const insertOne = jest.fn().mockResolvedValue(undefined);
    const db = {
      collection: jest.fn((name: string) => {
        if (name === "symptoms_current" || name === "symptoms_ledger") {
          return { insertOne };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    } as any;

    const caller = {
      patientId: "665f85cb40457089f5b75f9a",
      principalId: "pr_patient_1",
      role: "patient",
      orgId: "org_1",
    } as const;
    const startedAt = new Date(Date.now() + 60_000);

    const result = await createPatientSymptom(db, caller, {
      name: "Fatigue",
      severity: 3,
      startedAt,
      status: "active",
    });

    expect(result.current.recordedAt).toEqual(startedAt);
    expect(result.current.startedAt).toEqual(startedAt);
  });

  it("lifts recordedAt to startedAt when updating only startedAt", async () => {
    const existingRecordedAt = new Date("2026-06-10T10:00:00.000Z");
    const nextStartedAt = new Date("2026-06-10T12:00:00.000Z");
    const existing = {
      createdAt: new Date("2026-06-10T09:00:00.000Z"),
      createdBy: buildSymptomActor({
        patientId: "665f85cb40457089f5b75f9a",
        principalId: "pr_patient_1",
        role: "patient",
        orgId: "org_1",
      }),
      name: "Fatigue",
      normalizedName: normalizeSymptomName("Fatigue"),
      note: null,
      orgId: "org_1",
      patientId: { toString: () => "665f85cb40457089f5b75f9a" },
      recordedAt: existingRecordedAt,
      resolvedAt: null,
      severity: 3,
      source: "patient",
      startedAt: null,
      status: "active",
      symptomId: "sym_1",
      triggers: [],
      updatedAt: new Date("2026-06-10T10:00:00.000Z"),
      updatedBy: buildSymptomActor({
        patientId: "665f85cb40457089f5b75f9a",
        principalId: "pr_patient_1",
        role: "patient",
        orgId: "org_1",
      }),
    };

    const updateOne = jest.fn().mockResolvedValue(undefined);
    const insertOne = jest.fn().mockResolvedValue(undefined);
    const findOne = jest.fn().mockResolvedValue(existing);
    const db = {
      collection: jest.fn((name: string) => {
        if (name === "symptoms_current") {
          return { findOne, updateOne };
        }
        if (name === "symptoms_ledger") {
          return { insertOne };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    } as any;

    const caller = {
      patientId: "665f85cb40457089f5b75f9a",
      principalId: "pr_patient_1",
      role: "patient",
      orgId: "org_1",
    } as const;

    const result = await updatePatientSymptom(db, caller, "sym_1", {
      startedAt: nextStartedAt,
    });

    expect(result.current.recordedAt).toEqual(nextStartedAt);
    expect(result.current.startedAt).toEqual(nextStartedAt);
    expect(updateOne).toHaveBeenCalled();
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
