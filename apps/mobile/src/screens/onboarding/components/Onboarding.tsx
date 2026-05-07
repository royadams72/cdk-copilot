import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styles } from "@/screens/onboarding/styles";

export function OnboardingFormScreen({
  children,
  title,
  subtitle,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  subtitle?: string;
  title?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.screenContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 36 },
          contentContainerStyle,
        ]}
      >
        {title || subtitle ? (
          <View style={styles.header}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
