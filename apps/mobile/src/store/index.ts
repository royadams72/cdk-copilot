import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import { secureStorage } from "../lib/secureStorage";
import dashboardReducer from "./slices/dashboardSlice";
import logMealReducer from "./slices/logMealSlice";

export const rootReducer = combineReducers({
  dashboard: dashboardReducer,
  logMeal: logMealReducer,
});

const persistConfig = {
  key: "root",
  storage: secureStorage,
  whitelist: ["auth"], // keep this small
};

export const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  devTools: __DEV__,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false, // required for redux-persist
    }),
});

export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
