import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { persistReducer, persistStore } from "redux-persist";
import { secureStorage } from "../lib/secureStorage";
import dashboardReducer from "./slices/dashboardSlice";
import logMealReducer from "./slices/logMealSlice";
import { appApi } from "./services/appApi";

export const rootReducer = combineReducers({
  dashboard: dashboardReducer,
  [appApi.reducerPath]: appApi.reducer,
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
    }).concat(appApi.middleware),
  enhancers: (getDefaultEnhancers) => {
    const enhancers = getDefaultEnhancers();
    if (!__DEV__) {
      return enhancers;
    }

    // Keep the devtools package out of production bundles and runtime resolution.
    const devToolsEnhancer = require("redux-devtools-expo-dev-plugin").default;
    return enhancers.concat(devToolsEnhancer());
  },
});

export const persistor = persistStore(store);
setupListeners(store.dispatch);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
