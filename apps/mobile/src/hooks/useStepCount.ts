import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

type StepStatus =
  | "idle"
  | "unsupported"
  | "permission-denied"
  | "ready"
  | "error";

export function useStepCount(goal = 10000) {
  const [status, setStatus] = useState<StepStatus>("idle");
  const [stepsToday, setStepsToday] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let watchSubscription: { remove: () => void } | null = null;

    const load = async () => {
      if (Platform.OS === "web") {
        if (mounted) setStatus("unsupported");
        return;
      }

      try {
        const { Pedometer } = await import("expo-sensors");
        const available = await Pedometer.isAvailableAsync();
        if (!available) {
          if (mounted) setStatus("unsupported");
          return;
        }

        const currentPermissions = Pedometer.getPermissionsAsync
          ? await Pedometer.getPermissionsAsync()
          : null;

        let granted =
          typeof currentPermissions?.granted === "boolean"
            ? currentPermissions.granted
            : true;

        if (!granted && Pedometer.requestPermissionsAsync) {
          const requested = await Pedometer.requestPermissionsAsync();
          granted = !!requested.granted;
        }

        if (!granted) {
          if (mounted) setStatus("permission-denied");
          return;
        }

        const refreshTodaySteps = async () => {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const now = new Date();
          const result = await Pedometer.getStepCountAsync(startOfDay, now);
          if (!mounted) return;
          setStepsToday(result.steps ?? 0);
          setStatus("ready");
        };

        await refreshTodaySteps();

        watchSubscription = Pedometer.watchStepCount(() => {
          void refreshTodaySteps();
        });

        interval = setInterval(() => {
          void refreshTodaySteps();
        }, 60_000);
      } catch {
        if (mounted) setStatus("error");
      }
    };

    void load();

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      watchSubscription?.remove();
    };
  }, []);

  const percentOfGoal = useMemo(() => {
    if (stepsToday === null || goal <= 0) return null;
    return Math.min(1, stepsToday / goal);
  }, [goal, stepsToday]);

  return {
    goal,
    percentOfGoal,
    status,
    stepsToday,
  };
}
