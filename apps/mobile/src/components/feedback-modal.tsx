import { Modal, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";

type Mode = "error" | "info" | "success";

const tone: Record<Mode, { bg: string; text: string }> = {
  error: { bg: "rgba(239,68,68,0.16)", text: "#991B1B" },
  info: { bg: "rgba(59,130,246,0.16)", text: "#1E3A8A" },
  success: { bg: "rgba(16,185,129,0.16)", text: "#065F46" },
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
        style={{
          flex: 1,
          backgroundColor: "rgba(15,23,42,0.48)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.35)",
            backgroundColor: "#fff",
            padding: 16,
            gap: 10,
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: tone[mode].bg,
            }}
          >
            <ThemedText style={{ color: tone[mode].text, fontWeight: "700" }}>
              {mode.toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText type="defaultSemiBold">{title}</ThemedText>
          <ThemedText>{message}</ThemedText>
          <TouchableOpacity
            onPress={onClose}
            style={{
              alignSelf: "flex-end",
              marginTop: 4,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: "rgba(15,23,42,0.12)",
            }}
          >
            <ThemedText style={{ fontWeight: "600" }}>{actionLabel}</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
