import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { View } from "react-native";
import { styles } from "../styles";
import { DashboardRatio } from "../types";
import { getStatusStyles, ratioStatusLabel } from "../utils";
import { Card } from "./Card";

export function RatioCard({ ratio }: { ratio: DashboardRatio }) {
  const theme = useColorScheme() ?? "light";
  const statusStyles = getStatusStyles(ratio.status, theme);

  return (
    <Card>
      <ThemedText type="defaultSemiBold">
        Phosphorus to protein ratio
      </ThemedText>
      <View style={styles.ratioRow}>
        <ThemedText style={styles.ratioValue}>
          {ratio.value !== null && ratio.value !== undefined
            ? `${String(ratio.value)} ${ratio.unit}`
            : "Not enough data"}
        </ThemedText>
        <View style={[styles.statusPill, statusStyles.pill]}>
          <ThemedText style={[styles.statusPillText, statusStyles.text]}>
            {ratioStatusLabel(ratio.status)}
          </ThemedText>
        </View>
      </View>
      {ratio.target !== null && (
        <ThemedText style={styles.helperText}>
          Target ≤ {String(ratio.target)} {ratio.unit}
        </ThemedText>
      )}
      <ThemedText style={styles.helperText}>
        Based on the meals you logged this week.
      </ThemedText>
    </Card>
  );
}
