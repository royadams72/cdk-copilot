import { useState } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { API } from "@/constants/api";
import { getOrCreateAuthDeviceId } from "@/lib/authDevice";
import { LabeledInput } from "./components/FormFields";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";
import { PrimaryButton } from "@/screens/onboarding/components/Buttons";

export default function EmailSignup() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    try {
      setSubmitting(true);
      const deviceId = await getOrCreateAuthDeviceId();
      const res = await fetch(`${API}/api/patients/signup-init`, {
        body: JSON.stringify({ deviceId, email }),
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
      title="Email signup / login"
      subtitle="Enter your email to signup/login"
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
    </OnboardingFormScreen>
  );
}
