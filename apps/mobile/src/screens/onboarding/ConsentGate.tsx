import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { resolvePostAuthRoute } from "@/lib/onboarding";

import { PrimaryButton, SecondaryButton } from "./components/Buttons";
import { OnboardingFormScreen } from "./components/Onboarding";
import { styles } from "./styles";

type PendingConsentItem = {
  _id: string;
  type: string;
  assignmentId: string;
  careTeamId: string;
  clinicianPrincipalId?: string;
  copy?: {
    body?: string;
    title?: string;
  };
  facilityId: string;
  orgId: string;
  status: string;
};

type PendingConsentResponse = {
  items?: PendingConsentItem[];
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
  return { data, res };
}

async function fetchSessionState() {
  const res = await authFetch(`${API}/api/users/get-user`);
  const data = (await res
    .json()
    .catch(() => null)) as SessionStateResponse | null;
  return { data, res };
}

export default function ConsentGate() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<PendingConsentItem[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [{ data: consentData }] =
          await Promise.all([fetchPendingConsents(), fetchSessionState()]);

        setItems(consentData?.items ?? []);
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

  const summary = useMemo(() => {
    if (!currentItem) return null;
    return [currentItem.orgId, currentItem.facilityId, currentItem.careTeamId]
      .filter(Boolean)
      .join(" / ");
  }, [currentItem]);

  async function refreshStateAndRoute() {
    const [{ data: consentData }, { data: sessionData }] = await Promise.all([
      fetchPendingConsents(),
      fetchSessionState(),
    ]);

    const nextItems = consentData?.items ?? [];
    setItems(nextItems);

    if (nextItems.length > 0) {
      return;
    }

    router.replace(resolvePostAuthRoute(sessionData ?? {}) as never);
  }

  async function decide(decision: "agree" | "disagree") {
    if (!currentItem || submitting) return;

    setSubmitting(true);
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
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <OnboardingFormScreen title="Checking your consent status">
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" />
          <Text style={styles.subtitle}>
            Loading your care team access request...
          </Text>
        </View>
      </OnboardingFormScreen>
    );
  }

  if (!currentItem) {
    return (
      <OnboardingFormScreen
        title="No consent request found"
        subtitle="There are no pending consent requests for this account."
        contentContainerStyle={{ gap: 20 }}
      >
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton
          label="Continue"
          onPress={() => {
            void refreshStateAndRoute();
          }}
        />
      </OnboardingFormScreen>
    );
  }

  return (
    <OnboardingFormScreen
      title={currentItem.copy?.title ?? "Consent required"}
      subtitle={
        currentItem.copy?.body ??
        "A new care team or clinician needs your approval before you can continue."
      }
      contentContainerStyle={{ gap: 24 }}
    >
      <View style={styles.consentCard}>
        <Text style={styles.consentLabel}>Assignment</Text>
        <Text style={styles.consentValue}>
          {summary ?? currentItem.assignmentId}
        </Text>
        {currentItem.clinicianPrincipalId ? (
          <>
            <Text style={styles.consentLabel}>Clinician</Text>
            <Text style={styles.consentValue}>
              {currentItem.clinicianPrincipalId}
            </Text>
          </>
        ) : null}
        <Text style={styles.consentMeta}>
          Request type: {currentItem.type.replaceAll("_", " ")}
        </Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <PrimaryButton
        disabled={submitting}
        label={submitting ? "Saving..." : "Agree"}
        onPress={() => {
          void decide("agree");
        }}
      />
      <SecondaryButton
        disabled={submitting}
        label={submitting ? "Saving..." : "Disagree"}
        onPress={() => {
          void decide("disagree");
        }}
      />
    </OnboardingFormScreen>
  );
}
