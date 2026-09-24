import React from "react";
import { Text, View, type ScrollView, type ViewStyle } from "react-native";

import { AppScreen } from "@/components/AppScreen";
import { styles } from "@/screens/onboarding/styles";

export function OnboardingFormScreen({
  children,
  title,
  subtitle,
  contentContainerStyle,
  scrollRef,
}: {
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  scrollRef?: React.Ref<ScrollView>;
  subtitle?: string;
  title?: string;
}) {
  return (
    <AppScreen
      ref={scrollRef}
      keyboardAware
      padded={false}
      contentContainerStyle={[styles.screenContent, contentContainerStyle]}
    >
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
