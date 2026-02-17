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
}: {
  medications: MedicationSummary;
  onAdd: () => void;
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
            <ThemedText style={styles.medSummaryTitle}>{med.name}</ThemedText>
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

      <TouchableOpacity style={styles.primaryActionButton} onPress={onAdd}>
        <ThemedText style={styles.primaryActionText}>Add medication</ThemedText>
      </TouchableOpacity>
    </Card>
  );
}
