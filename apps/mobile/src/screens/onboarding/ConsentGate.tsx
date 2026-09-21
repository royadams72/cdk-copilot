import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { resolvePostAuthRoute } from "@/lib/onboarding";

import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
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
  noticeVersion?: string;
  purpose?: "direct_care";
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
  const [submitting, setSubmitting] = useState<
    "agree" | "continue" | "disagree" | null
  >(null);
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
          <Text style={styles.title}>No consent request found</Text>
          <Text style={styles.subtitle}>
            There are no pending consent requests for this account.
          </Text>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <AppButton
          disabled={submitting !== null}
          fullWidth
          label="Continue"
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
          {currentItem.copy?.body ??
            "A new care team or clinician needs your approval before you can continue."}
        </Text>
      </View>
      <View style={styles.consentCard}>
        <Text style={styles.bodyText}>
          If you agree, authorised members of this care team can use the health
          information you record in CKD Copilot to support your direct care.
          You can decline, ask your care team who has access, or contact them
          later if you want to discuss or withdraw access.
        </Text>
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
        {currentItem.noticeVersion ? (
          <Text style={styles.consentMeta}>
            Notice version: {currentItem.noticeVersion}
          </Text>
        ) : null}
      </View>

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
