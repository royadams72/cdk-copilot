import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { resolvePostAuthRoute } from "@/lib/onboarding";

import { AppScreen } from "@/components/app-screen";
import { ThemedText } from "@/components/themed-text";
import { AppButton } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { styles } from "./styles";

type PendingConsentItem = {
  _id: string;
  type: string;
  assignmentId: string;
  careTeamId: string;
  careTeamName?: string;
  clinicianPrincipalId?: string;
  clinicianName?: string;
  copy?: {
    body?: string;
    title?: string;
  };
  facilityId: string;
  facilityName?: string;
  orgId: string;
  orgName?: string;
  noticeVersion?: string;
  purpose?: "direct_care";
  status: string;
};

type PendingConsentResponse = {
  data?: { items?: PendingConsentItem[] };
  message?: string;
  ok?: boolean;
};

type SessionStateResponse = {
  activeAssignmentCount?: number;
  hasActiveAssignments?: boolean;
  hasPendingConsents?: boolean;
  ok?: boolean;
  onboardingCompleted?: boolean;
  onboardingSteps?: string[];
};

async function fetchPendingConsents() {
  const res = await authFetch(`${API}/api/patient-consents/pending`);
  const data = (await res
    .json()
    .catch(() => null)) as PendingConsentResponse | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message ?? "We couldn't load your consent request.");
  }
  return data.data?.items ?? [];
}

async function fetchSessionState() {
  const res = await authFetch(`${API}/api/users/get-user`);
  const data = (await res
    .json()
    .catch(() => null)) as SessionStateResponse | null;
  if (!res.ok || !data?.ok) {
    throw new Error("We couldn't refresh your account status.");
  }
  return { data, res };
}

export default function ConsentGate() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<
    "agree" | "continue" | "disagree" | null
  >(null);
  const [items, setItems] = useState<PendingConsentItem[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [pendingItems] = await Promise.all([
          fetchPendingConsents(),
          fetchSessionState(),
        ]);
        setItems(pendingItems);
      } catch (nextError: any) {
        setError(
          nextError?.message ?? "We couldn't load your consent request.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentItem = items[0] ?? null;

  async function refreshStateAndRoute() {
    const [nextItems, { data: sessionData }] = await Promise.all([
      fetchPendingConsents(),
      fetchSessionState(),
    ]);
    setItems(nextItems);

    if (nextItems.length > 0) {
      return;
    }

    router.replace(resolvePostAuthRoute(sessionData ?? {}) as never);
  }

  async function decide(decision: "agree" | "disagree") {
    if (!currentItem || submitting) return;

    setSubmitting(decision);
    setError("");

    try {
      const res = await authFetch(
        `${API}/api/patient-consents/${currentItem._id}/decide`,
        {
          body: JSON.stringify({
            decision,
            decisionSource: "in_app",
          }),
          method: "POST",
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "We couldn't save your decision.");
      }

      await refreshStateAndRoute();
    } catch (nextError: any) {
      setError(nextError?.message ?? "We couldn't save your decision.");
    } finally {
      setSubmitting(null);
    }
  }

  async function continueWithoutConsent() {
    if (submitting) return;
    setSubmitting("continue");
    setError("");
    try {
      await refreshStateAndRoute();
    } catch (nextError: any) {
      setError(nextError?.message ?? "We couldn't continue right now.");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <AppScreen
        contentContainerStyle={styles.screenContent}
        keyboardAware
        padded={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Checking your consent status</Text>
        </View>
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" />
          <Text style={styles.subtitle}>
            Loading your care team access request...
          </Text>
        </View>
      </AppScreen>
    );
  }

  if (!currentItem) {
    return (
      <AppScreen
        contentContainerStyle={[styles.screenContent, { gap: 20 }]}
        keyboardAware
        padded={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {error
              ? "Could not load consent request"
              : "No consent request found"}
          </Text>
          <Text style={styles.subtitle}>
            {error
              ? "Check your connection and try again."
              : "There are no pending consent requests for this account."}
          </Text>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <AppButton
          disabled={submitting !== null}
          fullWidth
          label={error ? "Try again" : "Continue"}
          loading={submitting === "continue"}
          onPress={() => void continueWithoutConsent()}
          variant="primary"
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      contentContainerStyle={[styles.screenContent, { gap: 24 }]}
      keyboardAware
      padded={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          {currentItem.copy?.title ?? "Consent required"}
        </Text>
        <Text style={styles.subtitle}>
          {currentItem.type === "clinician_added"
            ? `A clinician connected with ${currentItem.careTeamName ?? "your care team"} needs your approval.`
            : `${currentItem.careTeamName ?? "Your care team"} at ${currentItem.facilityName ?? "your care service"} has requested access.`}
        </Text>
      </View>
      <Section variant="group">
        <ThemedText>
          If you agree, authorised members of this care team can use the health
          information you record in CKD Copilot to support your direct care. You
          can decline, ask your care team who has access, or contact them later
          if you want to discuss or withdraw access.
        </ThemedText>
        <ThemedText style={styles.consentLabel}>Organisation</ThemedText>
        <ThemedText style={styles.consentValue}>
          {currentItem.orgName ?? "Your care organisation"}
        </ThemedText>
        <ThemedText style={styles.consentLabel}>Service</ThemedText>
        <ThemedText style={styles.consentValue}>
          {currentItem.facilityName ?? "Your care service"}
        </ThemedText>
        <ThemedText style={styles.consentLabel}>Care team</ThemedText>
        <ThemedText style={styles.consentValue}>
          {currentItem.careTeamName ?? "Your care team"}
        </ThemedText>
        {currentItem.clinicianPrincipalId ? (
          <>
            <ThemedText style={styles.consentLabel}>Clinician</ThemedText>
            <ThemedText style={styles.consentValue}>
              {currentItem.clinicianName ?? "A clinician from your care team"}
            </ThemedText>
          </>
        ) : null}
      </Section>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <AppButton
        disabled={submitting !== null}
        fullWidth
        label="Agree"
        loading={submitting === "agree"}
        onPress={() => {
          void decide("agree");
        }}
        variant="primary"
      />
      <AppButton
        disabled={submitting !== null}
        fullWidth
        label="Disagree"
        loading={submitting === "disagree"}
        onPress={() => {
          void decide("disagree");
        }}
        variant="secondary"
      />
    </AppScreen>
  );
}
