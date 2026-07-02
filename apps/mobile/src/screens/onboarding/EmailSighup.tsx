import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { API } from "@/constants/api";
import { getOrCreateAuthDeviceId } from "@/lib/authDevice";
import { LabeledInput } from "./components/FormFields";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";
import { PrimaryButton, SecondaryButton } from "@/screens/onboarding/components/Buttons";

export default function EmailSignup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    try {
      setSubmitting(true);
      const trimmedEmail = email.trim();
      const deviceId = await getOrCreateAuthDeviceId();
      const res = await fetch(`${API}/api/patients/signup-init`, {
        body: JSON.stringify({ deviceId, trimmedEmail }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert(
          "Signup failed",
          `Status ${res.status}\n${String(data?.error ?? data?.message ?? "Unknown error").slice(0, 500)}`,
        );
        return;
      }

      if (typeof data?.devLink === "string" && data.devLink.length > 0) {
        await Linking.openURL(data.devLink);
        return;
      }

      Alert.alert(
        "Check your email",
        "We sent you a verification link to continue in the app.",
      );
    } catch (e: any) {
      Alert.alert("Network error", String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingFormScreen
      title="Sign in to CKD Copilot"
      subtitle="Continue with your email, or use an activation code from your invitation."
    >
      <LabeledInput
        label="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <PrimaryButton
        label={submitting ? "Continuing..." : "Continue"}
        disabled={submitting}
        onPress={() => {
          void submit();
        }}
      />
      <SecondaryButton
        disabled={submitting}
        label="Use activation code"
        onPress={() => {
          router.push("/(auth)/activate" as never);
        }}
      />
    </OnboardingFormScreen>
  );
}
