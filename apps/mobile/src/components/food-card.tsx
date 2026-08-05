import { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { AppButton } from "@/components/ui/button";
import { theme } from "@/constants/theme";

type FoodCardAction = {
  label: string;
  onPress: () => void;
  variant?: "ghost" | "danger" | "primary";
};

type FoodCardProps = {
  title: string;
  subtitle?: string;
  description?: string;
  rightContent?: ReactNode;
  onPress?: () => void;
  actions?: FoodCardAction[];
  style?: ViewStyle;
};

export function FoodCard({
  title,
  subtitle,
  description,
  rightContent,
  onPress,
  actions = [],
  style,
}: FoodCardProps) {
  const Container = onPress ? Pressable : View;
  const containerProps = onPress ? { onPress } : {};

  return (
    <Container style={[styles.card, style]} {...containerProps}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
        {description ? <ThemedText style={styles.description}>{description}</ThemedText> : null}
      </View>
      <View style={styles.side}>
        {rightContent}
        {actions.length ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <AppButton
                key={`${action.label}-${action.variant ?? "ghost"}`}
                label={action.label}
                onPress={action.onPress}
                size="compact"
                style={styles.actionButton}
                variant={
                  action.variant === "danger"
                    ? "danger"
                    : action.variant === "primary"
                      ? "success"
                      : "outline"
                }
              />
            ))}
          </View>
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.control,
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  side: {
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.panelHeader,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.copy,
  },
  description: {
    fontSize: 13,
    color: theme.colors.copy,
  },
  actions: {
    flexDirection: "column",
    gap: 8,
  },
  actionButton: {
    width: 96,
  },
});
