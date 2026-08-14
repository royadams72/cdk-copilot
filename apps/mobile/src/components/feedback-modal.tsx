import { Modal, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { AppButton } from "@/components/ui/button";
import { theme } from "@/constants/theme";

type Mode = "error" | "info" | "success" | "warning";

const tone: Record<Mode, { bg: string; text: string; button: "danger" | "primary" | "success" }> = {
  error: { bg: theme.colors.dangerSoft, text: theme.colors.dangerDark, button: "danger" },
  info: { bg: theme.colors.infoSoft, text: theme.colors.infoDark, button: "primary" },
  success: { bg: theme.colors.successSoft, text: theme.colors.successDark, button: "success" },
  warning: { bg: theme.colors.warningSoft, text: theme.colors.warningDark, button: "primary" },
};

export function FeedbackModal({
  mode = "info",
  visible,
  title,
  message,
  onClose,
  actionLabel = "Close",
}: {
  mode?: Mode;
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  actionLabel?: string;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View
        style={modalStyles.backdrop}
      >
        <View
          accessibilityViewIsModal
          style={modalStyles.card}
        >
          <View
            style={[modalStyles.badge, { backgroundColor: tone[mode].bg }]}
          >
            <ThemedText style={{ color: tone[mode].text, fontWeight: "700" }}>
              {mode.toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText type="defaultSemiBold">{title}</ThemedText>
          <ThemedText>{message}</ThemedText>
          <View style={modalStyles.actions}>
            <AppButton label={actionLabel} onPress={onClose} variant={tone[mode].button} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ErrorModal(props: Omit<React.ComponentProps<typeof FeedbackModal>, "mode">) {
  return <FeedbackModal {...props} mode="error" />;
}

export function SuccessModal(props: Omit<React.ComponentProps<typeof FeedbackModal>, "mode">) {
  return <FeedbackModal {...props} mode="success" />;
}

export function WarningModal(props: Omit<React.ComponentProps<typeof FeedbackModal>, "mode">) {
  return <FeedbackModal {...props} mode="warning" />;
}

const modalStyles = StyleSheet.create({
  backdrop: { backgroundColor: theme.colors.overlay, flex: 1, justifyContent: "center", padding: theme.spacing.xl },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.xl, borderWidth: 1, gap: theme.spacing.md, padding: theme.spacing.lg },
  badge: { alignSelf: "flex-start", borderRadius: theme.radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  actions: { alignItems: "flex-end", marginTop: theme.spacing.xs },
});
