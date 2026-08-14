import { View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "./Card";
import { styles } from "../styles";
import { formatDateShort } from "../utils";
import { DashboardData } from "../types";
import { AppButton } from "@/components/ui/button";

type MedicationSummary = DashboardData["medications"];

export function MedicationCard({
  medications,
  onAdd,
  onEdit,
  onHistory,
}: {
  medications: MedicationSummary;
  onAdd: () => void;
  onEdit: (medicationId: string) => void;
  onHistory: () => void;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold" style={styles.panelTitle}>Medications</ThemedText>
      <ThemedText style={styles.helperText}>
        {medications.activeCount} active of {medications.totalCount} total
      </ThemedText>

      {medications.recent.length ? (
        medications.recent.map((med) => (
          <View key={med.id} style={styles.medSummaryRow}>
            <View style={styles.medSummaryHeaderRow}>
              <ThemedText style={styles.medSummaryTitle}>{med.name}</ThemedText>
              <AppButton
                label="Edit"
                onPress={() => onEdit(med.id)}
                variant="outline"
                size="compact"
              />
            </View>
            <ThemedText style={styles.medSummaryMeta}>
              {[med.dose, med.frequency].filter(Boolean).join(" · ") ||
                "Dose/frequency not set"}
            </ThemedText>
            <ThemedText style={styles.medSummaryMeta}>
              Started {formatDateShort(med.startAt)}
            </ThemedText>
          </View>
        ))
      ) : (
        <ThemedText style={styles.helperText}>
          No medications recorded yet.
        </ThemedText>
      )}

      <View style={styles.medActionsRow}>
        <AppButton label="Add medication" onPress={onAdd} size="compact" />
        <AppButton label="Med history" onPress={onHistory} variant="secondary" size="compact" />
      </View>
    </Card>
  );
}
