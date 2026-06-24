import { Text } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";
import { PrimaryButton } from "@/screens/onboarding/components/Buttons";

export default function CheckEmail() {
  const router = useRouter();

  return (
    <OnboardingFormScreen title="There's been an isssue">
      <Text style={{ color: "#334155", fontSize: 16, lineHeight: 24 }}>
        You can go back and try again
      </Text>
      <PrimaryButton
        label="Back to email"
        onPress={() => {
          router.replace("/(init-app)/welcome");
        }}
      />
    </OnboardingFormScreen>
  );
}
