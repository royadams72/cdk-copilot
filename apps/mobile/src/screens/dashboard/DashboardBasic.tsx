import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";

type DashboardPayload = {
  patientId: string;
  message: string;
  generatedAt: string;
};

type DashboardResponse = {
  ok: boolean;
  data: DashboardPayload;
};

export default function DashboardBasic() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: DashboardPayload | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API}/api/dashboard`, {
          method: "GET",
        });
        const body: DashboardResponse | null = await res
          .json()
          .catch(() => null);
        if (!res.ok || !(body as DashboardResponse).ok) {
          throw new Error(formatApiError(res.status, (body as any) ?? null));
        }
        setState({
          loading: false,
          error: null,
          data: (body as DashboardResponse).data,
        });
      } catch (err: any) {
        setState({
          loading: false,
          error: err?.message ?? "Failed to load dashboard",
          data: null,
        });
      }
    })();
  }, []);

  if (state.loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.helper}>Loading dashboard…</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{state.error}</Text>
      </View>
    );
  }

  if (!state.data) {
    return (
      <View style={styles.centered}>
        <Text>No dashboard data available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.label}>Patient</Text>
      <Text style={styles.value}>{state.data.patientId}</Text>

      <Text style={styles.label}>Message</Text>
      <Text style={styles.value}>{state.data.message}</Text>

      <Text style={styles.label}>Generated</Text>
      <Text style={styles.value}>
        {new Date(state.data.generatedAt).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    opacity: 0.7,
  },
  value: {
    fontSize: 16,
    fontWeight: "500",
  },
  helper: {
    marginTop: 12,
  },
  error: {
    color: "#b91c1c",
    textAlign: "center",
  },
});
