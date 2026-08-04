import type { ReactNode } from "react";
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

export function AppScreen({
  children,
  contentContainerStyle,
  keyboardAware = false,
  padded = true,
  scroll = true,
  style,
  ...scrollProps
}: ScrollViewProps & {
  children: ReactNode;
  keyboardAware?: boolean;
  padded?: boolean;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const contentStyle = [
    styles.content,
    padded && styles.padded,
    contentContainerStyle,
    {
      paddingTop: Math.max(insets.top, theme.spacing.lg),
      paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.lg,
    },
  ];

  const body = scroll ? (
    <ScrollView
      automaticallyAdjustKeyboardInsets={keyboardAware && Platform.OS === "ios"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
      contentContainerStyle={contentStyle}
      style={[styles.screen, style]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screen, ...contentStyle, style]}>{children}</View>
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
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.colors.background, flex: 1 },
  content: { flexGrow: 1 },
  padded: { gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg },
});
