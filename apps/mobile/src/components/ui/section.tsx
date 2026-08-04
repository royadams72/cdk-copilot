import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { theme } from "@/constants/theme";
import { AppButton } from "./button";

export function Section({
  actionLabel,
  children,
  description,
  emptyLabel,
  footer,
  onAction,
  style,
  title,
  variant = "card",
}: {
  actionLabel?: string;
  children?: ReactNode;
  description?: string;
  emptyLabel?: string;
  footer?: ReactNode;
  onAction?: () => void;
  style?: ViewStyle;
  title?: string;
  variant?: "card" | "group" | "plain";
}) {
  const empty = !children;
  return (
    <View style={[styles.base, styles[variant], style]}>
      {title || description ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      ) : null}
      {empty && emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : children}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} variant="outline" size="compact" />
      ) : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg, borderWidth: 1, padding: theme.spacing.lg },
  group: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.lg, padding: theme.spacing.lg },
  plain: {},
  header: { gap: theme.spacing.xs },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
  description: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  empty: { color: theme.colors.textMuted, fontSize: 14 },
});
