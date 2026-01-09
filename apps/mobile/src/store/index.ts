import { configureStore } from "@reduxjs/toolkit";

import dashboardReducer from "./slices/dashboardSlice";
import logMealReducer from "./slices/logMealSlice";
export const store = configureStore({
  reducer: {
    dashboard: dashboardReducer,
    logMeal: logMealReducer,
  },
  devTools: __DEV__,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
