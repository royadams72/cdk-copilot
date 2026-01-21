import { Slot } from "expo-router";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "@/store";

export default function RootLayout() {
  return (
    <PersistGate loading={null} persistor={persistor}>
      <Provider store={store}>
        <Slot />
      </Provider>
    </PersistGate>
  );
}
