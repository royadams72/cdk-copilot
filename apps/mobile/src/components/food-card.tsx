import { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { ThemedText } from "@/components/themed-text";

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
              <Pressable
                key={`${action.label}-${action.variant ?? "ghost"}`}
                style={[
                  styles.actionButton,
                  action.variant === "danger" && styles.actionDanger,
                  action.variant === "primary" && styles.actionPrimary,
                ]}
                onPress={action.onPress}
              >
                <ThemedText
                  style={[
                    styles.actionText,
                    action.variant !== "ghost" && styles.actionTextLight,
                  ]}
                >
                  {action.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(148,163,184,0.2)",
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
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#4b5563",
  },
  description: {
    fontSize: 13,
    color: "#6b7280",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 62,
    alignItems: "center",
  },
  actionDanger: {
    backgroundColor: "#dc2626",
  },
  actionPrimary: {
    backgroundColor: "#0f766e",
  },
  actionText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  actionTextLight: {
    color: "#fff",
  },
});
