import { PropsWithChildren, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { styles } from "../styles";
import { Card } from "./Card";

type AccordionCardProps = PropsWithChildren<{
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  subtitle: string;
  title: string;
}>;

export function AccordionCard({
  children,
  defaultOpen = false,
  isOpen,
  onToggle,
  subtitle,
  title,
}: AccordionCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = isOpen ?? internalOpen;
  const isControlled = useMemo(() => typeof isOpen === "boolean", [isOpen]);

  const handleToggle = () => {
    const next = !expanded;
    if (!isControlled) setInternalOpen(next);
    onToggle?.(next);
  };

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        onPress={handleToggle}
        style={styles.accordionHeader}
      >
        <View style={styles.accordionHeaderCopy}>
          <ThemedText type="defaultSemiBold">{title}</ThemedText>
          <ThemedText style={styles.helperText}>{subtitle}</ThemedText>
        </View>
        <ThemedText
          style={[
            styles.accordionArrow,
            expanded ? styles.accordionArrowOpen : styles.accordionArrowClosed,
          ]}
        >
          ›
        </ThemedText>
      </Pressable>
      {expanded ? <View style={styles.accordionBody}>{children}</View> : null}
    </Card>
  );
}
