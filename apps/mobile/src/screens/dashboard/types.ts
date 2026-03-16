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

export type NutrientKey =
  | "caloriesKcal"
  | "proteinG"
  | "phosphorusMg"
  | "potassiumMg"
  | "sodiumMg";

export type NutritionMetricKey =
  | "proteinG"
  | "phosphorusMg"
  | "potassiumMg"
  | "sodiumMg"
  | "phosphorus_protein_ratio";

export type NutritionDailyPoint = {
  date: string;
  label: string;
  totals: Record<NutrientKey, number>;
};

export type FoodHighlight = {
  name: string;
  amount: number;
  unit: string;
  mealType: string | null;
  eatenAt: string | null;
};

export type FoodHighlights = {
  latestDate: string | null;
  itemsByDate: Record<string, Record<NutritionMetricKey, FoodHighlight[]>>;
};

export type NutritionTrendChunk = {
  hasMore: boolean;
  nextBefore: string | null;
  nutrition: {
    range: DashboardRange;
    totals: Record<string, number>;
    radials: DashboardRadial[];
    ratio: DashboardRatio;
    dailySeries: NutritionDailyPoint[];
    foodHighlights: FoodHighlights;
    mealsByDate: Record<string, NutritionMealEntry[]>;
  };
  targets: Partial<Record<NutrientKey, number>>;
  window: {
    days: number;
    from: string;
    to: string;
  };
};

export type NutritionMealEntry = {
  id: string;
  mealType: string;
  eatenAt: string | null;
  items: {
    uid: string;
    foodId: string;
    name: string;
    quantity: number;
    unit: string;
    nutrients: Record<string, number | undefined>;
    source?: string;
  }[];
};

export type LabSummary = {
  code: string;
  id: string;
  label: string;
  value: number | null;
  unit: string;
  refRange: {
    low: number | null;
    high: number | null;
    text: string | null;
  };
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
  labs: {
    tracked: Record<string, LabSummary | null>;
    recent: LabSummary[];
  };
  medications: {
    activeCount: number;
    totalCount: number;
    recent: Array<{
      id: string;
      name: string;
      dose: string | null;
      frequency: string | null;
      route: string | null;
      form: string | null;
      startAt: string | null;
      status: "active" | "paused" | "stopped" | "completed";
    }>;
  };
  nutrition: {
    range: DashboardRange;
    totals: Record<string, number>;
    radials: DashboardRadial[];
    ratio: DashboardRatio;
    dailySeries: NutritionDailyPoint[];
    foodHighlights: FoodHighlights;
    mealsByDate: Record<string, NutritionMealEntry[]>;
  };
};

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
};
