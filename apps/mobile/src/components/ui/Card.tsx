import type { PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ThemedTextColorProvider } from "@/components/themed-text";
import { theme } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const colorScheme = useColorScheme() ?? "light";

  return (
    <View
      style={[
        styles.card,
        colorScheme === "light" ? styles.light : styles.dark,
        style,
      ]}
    >
      <ThemedTextColorProvider color={theme.colors.text}>
        {children}
      </ThemedTextColorProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  dark: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderSubtle,
  },
  light: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
});
