import { ThemedText } from "@/components/themed-text";
import { View } from "react-native/Libraries/Components/View/View";
import { Card } from "./Card";
import { styles } from "../styles";
import { LabSummary } from "../types";
import { LAB_CONFIG } from "../constants";
import { formatDateShort, formatDecimal } from "../utils";

export function LabsCard({
  labs,
}: {
  labs: Record<string, LabSummary | null>;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">Latest labs</ThemedText>
      {LAB_CONFIG.map((config) => {
        const lab = labs?.[config.id];
        return (
          <View key={config.id} style={styles.labRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.labLabel}>{config.label}</ThemedText>
              <ThemedText style={styles.labSubtext}>
                {lab?.takenAt
                  ? `Taken ${formatDateShort(lab.takenAt)}`
                  : "No recent result"}
              </ThemedText>
            </View>
            <View style={styles.labValueWrap}>
              <ThemedText style={styles.labValue}>
                {lab?.value !== null && lab?.value !== undefined
                  ? formatDecimal(lab.value, config.precision)
                  : "—"}
              </ThemedText>
              <ThemedText style={styles.labUnit}>
                {lab?.unit ?? config.unit}
              </ThemedText>
              {lab?.abnormalFlag && (
                <View style={styles.flagPill}>
                  <ThemedText style={styles.flagPillText}>
                    {lab.abnormalFlag}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}
