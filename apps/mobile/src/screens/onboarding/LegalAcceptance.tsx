import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { API } from "@/constants/api";
import { LEGAL_VERSIONS } from "@/constants/legal";
import { APP_ROUTES } from "@/constants/routes";
import { authFetch } from "@/lib/authFetch";
import { styles } from "./styles";

function Choice({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.actionsRow}>
      <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
        {checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
      </View>
      <Text style={[styles.bodyText, styles.flexItem]}>{label}</Text>
    </Pressable>
  );
}

export default function LegalAcceptance() {
  const router = useRouter();
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await authFetch(`${API}/api/onboarding/legal-acceptance`, {
        body: JSON.stringify({ privacyAcknowledged, privacyVersion: LEGAL_VERSIONS.privacy, termsAccepted, termsVersion: LEGAL_VERSIONS.terms }),
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? body?.message ?? "We couldn't save your choices.");
      router.replace(APP_ROUTES.piiOnboarding);
    } catch (nextError: any) {
      setError(nextError?.message ?? "We couldn't save your choices.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={[styles.screenContent, { gap: 20 }]} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Before you continue</Text>
        <Text style={styles.subtitle}>Review the terms for using CKD Copilot and how your information is handled.</Text>
      </View>
      <AppButton fullWidth label="Read the Terms and Conditions" onPress={() => router.push(APP_ROUTES.terms as never)} variant="secondary" />
      <Choice checked={termsAccepted} label="I agree to the Terms and Conditions." onPress={() => setTermsAccepted((value) => !value)} />
      <AppButton fullWidth label="Read the Privacy Notice" onPress={() => router.push(APP_ROUTES.privacyNotice as never)} variant="secondary" />
      <Choice checked={privacyAcknowledged} label="I confirm that I have been given access to the Privacy Notice." onPress={() => setPrivacyAcknowledged((value) => !value)} />
      <Text style={styles.bodyText}>These acknowledgements are separate from your care-team access decision. Optional research or other secondary uses require a separate choice.</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <AppButton disabled={!termsAccepted || !privacyAcknowledged || submitting} fullWidth label="Accept and continue" loading={submitting} onPress={() => void submit()} />
    </AppScreen>
  );
}
