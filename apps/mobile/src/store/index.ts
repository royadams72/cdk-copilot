import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { persistReducer, persistStore } from "redux-persist";
import { secureStorage } from "../lib/secureStorage";
import dashboardReducer from "./slices/dashboardSlice";
import logMealReducer from "./slices/logMealSlice";
import { dashboardApi } from "./services/dashboardApi";
import devToolsEnhancer from "redux-devtools-expo-dev-plugin";
export const rootReducer = combineReducers({
  dashboard: dashboardReducer,
  [dashboardApi.reducerPath]: dashboardApi.reducer,
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
    }).concat(dashboardApi.middleware),
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().concat(devToolsEnhancer()),
});

export const persistor = persistStore(store);
setupListeners(store.dispatch);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
