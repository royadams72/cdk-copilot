import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import { API } from "@/constants/api";
import { getOrCreateAuthDeviceId } from "@/lib/authDevice";
import { completeAuthExchange } from "@/lib/completeAuthExchange";
import { logPostAuthRouteDecision, resolvePostAuthRoute } from "@/lib/onboarding";
import { PrimaryButton, SecondaryButton } from "@/screens/onboarding/components/Buttons";
import { LabeledInput } from "@/screens/onboarding/components/FormFields";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";

export default function ActivationCodeScreen() {
  const router = useRouter();
  const [activationCode, setActivationCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    try {
      setSubmitting(true);
      const deviceId = await getOrCreateAuthDeviceId();
      const response = await fetch(`${API}/api/auth/activate-code`, {
        body: JSON.stringify({
          activationCode: activationCode.trim(),
          deviceId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
      };

      if (!response.ok || !body.token) {
        Alert.alert(
          "Activation failed",
          String(body.error ?? "We couldn't activate that code."),
        );
        return;
      }

      const session = await completeAuthExchange(body.token);
      logPostAuthRouteDecision("activation-code", session);
      router.replace(resolvePostAuthRoute(session) as never);
    } catch (error: any) {
      Alert.alert("Network error", String(error?.message || error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingFormScreen
      title="Enter activation code"
      subtitle="Use the code from your CKD Copilot invitation email."
    >
      <LabeledInput
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="default"
        label="Activation code"
        onChangeText={setActivationCode}
        placeholder="Activation code"
        value={activationCode}
      />
      <PrimaryButton
        disabled={submitting || activationCode.trim().length === 0}
        label={submitting ? "Activating..." : "Continue"}
        onPress={() => {
          void submit();
        }}
      />
      <SecondaryButton
        disabled={submitting}
        label="Back to email sign in"
        onPress={() => {
          router.replace("/(init-app)/welcome");
        }}
      />
    </OnboardingFormScreen>
  );
}
