import { configureStore } from "@reduxjs/toolkit";
import { persistReducer } from "redux-persist";
import { secureStorage } from "../lib/secureStorage";
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
