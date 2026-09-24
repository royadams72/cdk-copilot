import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { theme } from "@/constants/theme";
import { ThemedTextColorProvider } from "@/components/ThemedTextColorContext";
import { AppButton } from "./Button";
import { Card } from "./Card";

export function Section({
  actionLabel,
  cardStyle,
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
  cardStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  description?: string;
  emptyLabel?: string;
  footer?: ReactNode;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  title?: string;
  variant?: "card" | "group" | "plain";
}) {
  const empty = !children;
  const content = (
    <>
      {title || description ? (
        <View style={styles.header}>
          {title ? (
            <Text
              style={[
                styles.title,
                variant === "plain" ? styles.textOnBackground : null,
              ]}
            >
              {title}
            </Text>
          ) : null}
          {description ? (
            <Text
              style={[
                styles.description,
                variant === "plain" ? styles.textOnBackground : null,
              ]}
            >
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      <ThemedTextColorProvider
        color={
          variant === "plain" ? theme.colors.onBackground : theme.colors.text
        }
      >
        {empty && emptyLabel ? (
          <Text
            style={[
              styles.empty,
              variant === "plain" ? styles.textOnBackground : null,
            ]}
          >
            {emptyLabel}
          </Text>
        ) : (
          children
        )}
        {actionLabel && onAction ? (
          <AppButton
            label={actionLabel}
            onPress={onAction}
            variant="outline"
            size="compact"
          />
        ) : null}
        {footer}
      </ThemedTextColorProvider>
    </>
  );

  if (variant === "card") {
    return (
      <Card style={[styles.base, styles.card, style, cardStyle]}>
        {content}
      </Card>
    );
  }

  return <View style={[styles.base, styles[variant], style]}>{content}</View>;
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  group: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  plain: {},
  header: { gap: theme.spacing.xs },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
  description: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  empty: { color: theme.colors.textMuted, fontSize: 14 },
  textOnBackground: { color: theme.colors.onBackground },
});
