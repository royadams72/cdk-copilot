import { TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "./Card";
import { styles } from "../styles";
import { formatDateShort } from "../utils";
import { DashboardData } from "../types";

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
      <ThemedText type="defaultSemiBold">Medications</ThemedText>
      <ThemedText style={styles.helperText}>
        {medications.activeCount} active of {medications.totalCount} total
      </ThemedText>

      {medications.recent.length ? (
        medications.recent.map((med) => (
          <View key={med.id} style={styles.medSummaryRow}>
            <View style={styles.medSummaryHeaderRow}>
              <ThemedText style={styles.medSummaryTitle}>{med.name}</ThemedText>
              <TouchableOpacity
                style={styles.medEditButton}
                onPress={() => onEdit(med.id)}
              >
                <ThemedText style={styles.medEditButtonText}>Edit</ThemedText>
              </TouchableOpacity>
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
        <TouchableOpacity style={styles.primaryActionButton} onPress={onAdd}>
          <ThemedText style={styles.primaryActionText}>Add medication</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryActionButton} onPress={onHistory}>
          <ThemedText style={styles.secondaryActionText}>Med history</ThemedText>
        </TouchableOpacity>
      </View>
    </Card>
  );
}
