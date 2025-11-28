export type DashboardRadial = {
  id: string;
  label: string;
  unit: string;
  actual: number | null;
  target: number | null;
  percent: number | null;
};

export type DashboardRatio = {
  value: number | null;
  target: number | null;
  unit: string;
  status: "in-range" | "high" | "unknown";
};

export type DashboardRange = {
  from: string;
  to: string;
  days: number;
  entries: number;
  lastEntryAt: string | null;
};

export type LabSummary = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  takenAt: string | null;
  abnormalFlag: string | null;
};

export type DashboardData = {
  patientId: string;
  summary: {
    ckdStage: string | null;
    egfrCurrent: number | null;
    dialysisStatus: string | null;
    lastClinicalUpdateAt: string | null;
  };
  labs: Record<string, LabSummary | null>;
  nutrition: {
    range: DashboardRange;
    totals: Record<string, number>;
    radials: DashboardRadial[];
    ratio: DashboardRatio;
  };
};

export type ApiResponse = {
  ok: boolean;
  data: DashboardData;
};
