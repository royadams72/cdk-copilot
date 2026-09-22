import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { AppButton } from "@/components/ui/Button";
import { styles } from "../styles";

export function RepeatableFormCard({
  children,
  onRemove,
  removeLabel,
  title,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel: string;
  title: string;
}) {
  return (
    <View style={styles.repeatableCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {onRemove ? (
        <AppButton label={removeLabel} variant="danger" onPress={onRemove} />
      ) : null}
    </View>
  );
}
