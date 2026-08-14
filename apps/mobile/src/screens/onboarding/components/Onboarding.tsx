import React from "react";
import { Text, View, type ViewStyle } from "react-native";

import { AppScreen } from "@/components/app-screen";
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
  return (
    <AppScreen keyboardAware contentContainerStyle={[styles.screenContent, contentContainerStyle]}>
        {title || subtitle ? (
          <View style={styles.header}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
    </AppScreen>
  );
}
