import { forwardRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "@/constants/theme";
import { ThemedTextColorProvider } from "@/components/themed-text";

export const AppScreen = forwardRef<ScrollView, ScrollViewProps & {
  children: ReactNode;
  keyboardAware?: boolean;
  padded?: boolean;
  scroll?: boolean;
  style?: ViewStyle;
}>(function AppScreen({
  children,
  contentContainerStyle,
  keyboardAware = false,
  padded = true,
  scroll = true,
  style,
  ...scrollProps
}, ref) {
  const insets = useSafeAreaInsets();
  const contentStyle = [
    styles.content,
    padded && styles.padded,
    {
      paddingTop: Math.max(insets.top, theme.spacing.lg),
      paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.lg,
    },
    contentContainerStyle,
  ];

  const body = scroll ? (
    <ScrollView
      ref={ref}
      automaticallyAdjustKeyboardInsets={keyboardAware && Platform.OS === "ios"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
      contentContainerStyle={contentStyle}
      style={[styles.screen, style]}
    >
      <ThemedTextColorProvider color={theme.colors.onBackground}>
        {children}
      </ThemedTextColorProvider>
    </ScrollView>
  ) : (
    <View style={[styles.screen, ...contentStyle, style]}>
      <ThemedTextColorProvider color={theme.colors.onBackground}>
        {children}
      </ThemedTextColorProvider>
    </View>
  );

  return keyboardAware ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={styles.screen}
    >
      {body}
    </KeyboardAvoidingView>
  ) : body;
});

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.colors.background, flex: 1 },
  content: { flexGrow: 1 },
  padded: { gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg },
});
