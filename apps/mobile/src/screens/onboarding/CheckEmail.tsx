import { Text } from "react-native";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";

export default function CheckEmail() {
  return (
    <OnboardingFormScreen title="Check your email">
      <Text style={{ color: "#334155", fontSize: 16, lineHeight: 24 }}>
        We sent a verification link to your email. Open it on this device.
      </Text>
    </OnboardingFormScreen>
  );
}
