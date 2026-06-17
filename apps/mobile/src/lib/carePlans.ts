import AsyncStorage from "@react-native-async-storage/async-storage";

const CARE_PLAN_LAST_VIEWED_AT_KEY = "ckd_care_plan_last_viewed_at";

export async function getLastViewedCarePlanAt() {
  return AsyncStorage.getItem(CARE_PLAN_LAST_VIEWED_AT_KEY);
}

export async function setLastViewedCarePlanAt(value: string) {
  await AsyncStorage.setItem(CARE_PLAN_LAST_VIEWED_AT_KEY, value);
}
