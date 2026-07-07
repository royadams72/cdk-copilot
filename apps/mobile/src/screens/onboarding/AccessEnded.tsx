import { useEffect } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";

import { APP_ROUTES } from "@/constants/routes";
import { clearSessionToken } from "@/lib/authSession";
import { PrimaryButton } from "@/screens/onboarding/components/Buttons";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";
import { styles } from "@/screens/onboarding/styles";

export default function AccessEndedScreen() {
  const router = useRouter();

  useEffect(() => {
    void clearSessionToken();
  }, []);

  return (
    <OnboardingFormScreen
      title="Access no longer active"
      subtitle="Your CKD Copilot membership is not currently active."
      contentContainerStyle={{ gap: 20 }}
    >
      <Text style={styles.subtitle}>
        If you think this is a mistake, contact your care team or clinic to check
        your access.
      </Text>
      <PrimaryButton
        label="Back to sign in"
        onPress={() => {
          router.replace(APP_ROUTES.welcome);
        }}
      />
    </OnboardingFormScreen>
  );
}
