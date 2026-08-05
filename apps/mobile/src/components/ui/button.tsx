import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";

import { theme } from "@/constants/theme";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "success"
  | "danger"
  | "link";

export type AppButtonProps = {
  accessibilityLabel?: string;
  backgroundColor?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  href?: string;
  iconAfter?: ReactNode;
  iconBefore?: ReactNode;
  label: string;
  loading?: boolean;
  onPress?: () => void;
  size?: "compact" | "standard" | "large";
  testID?: string;
  textColor?: string;
  variant?: ButtonVariant;
};

export function AppButton({
  accessibilityLabel,
  backgroundColor,
  disabled = false,
  fullWidth = false,
  href,
  iconAfter,
  iconBefore,
  label,
  loading = false,
  onPress,
  size = "standard",
  testID,
  textColor,
  variant = "primary",
}: AppButtonProps) {
  const inactive = disabled || loading;
  const button = (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={href || variant === "link" ? "link" : "button"}
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        styles[variant],
        backgroundColor ? { backgroundColor } : null,
        fullWidth && styles.fullWidth,
        pressed && !inactive && styles[`${variant}Pressed`],
        inactive && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={textColor ?? textColors[variant]} size="small" /> : iconBefore}
        <Text style={[styles.label, styles[`${size}Label`], { color: textColor ?? textColors[variant] }]}>
          {label}
        </Text>
        {!loading ? iconAfter : null}
      </View>
    </Pressable>
  );

  return href && !inactive ? <Link href={href as never} asChild>{button}</Link> : button;
}

const textColors: Record<ButtonVariant, string> = {
  primary: theme.colors.onPrimary,
  secondary: theme.colors.text,
  outline: theme.colors.text,
  ghost: theme.colors.text,
  success: theme.colors.onPrimary,
  danger: theme.colors.onPrimary,
  link: theme.colors.primary,
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: theme.radii.pill,
    justifyContent: "center",
    minWidth: theme.controls.touchTarget,
  },
  content: { alignItems: "center", flexDirection: "row", gap: theme.spacing.sm },
  label: { fontWeight: "700", textAlign: "center" },
  compact: { minHeight: theme.controls.touchTarget, paddingHorizontal: theme.spacing.md },
  standard: { minHeight: theme.controls.height, paddingHorizontal: theme.spacing.lg },
  large: { minHeight: 54, paddingHorizontal: theme.spacing.xl },
  compactLabel: { fontSize: 14 },
  standardLabel: { fontSize: 16 },
  largeLabel: { fontSize: 17 },
  fullWidth: { alignSelf: "stretch" },
  primary: { backgroundColor: theme.colors.primary },
  primaryPressed: { backgroundColor: theme.colors.primaryPressed },
  secondary: { backgroundColor: theme.colors.control },
  secondaryPressed: { backgroundColor: theme.colors.controlPressed },
  outline: { backgroundColor: theme.colors.surface, borderColor: theme.colors.textMuted, borderWidth: 1 },
  outlinePressed: { backgroundColor: theme.colors.surfaceMuted },
  ghost: { backgroundColor: "transparent" },
  ghostPressed: { backgroundColor: theme.colors.control },
  success: { backgroundColor: theme.colors.success },
  successPressed: { backgroundColor: theme.colors.successDark },
  danger: { backgroundColor: theme.colors.danger },
  dangerPressed: { backgroundColor: theme.colors.dangerDark },
  link: { backgroundColor: "transparent", minHeight: theme.controls.touchTarget, paddingHorizontal: theme.spacing.sm },
  linkPressed: { opacity: 0.7 },
  disabled: { backgroundColor: theme.colors.disabled, opacity: 0.65 },
});
