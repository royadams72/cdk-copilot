import { ThemedText } from "@/components/themed-text";
import { useColorScheme, View } from "react-native";
import { styles } from "../styles";
import { DashboardRatio } from "../types";
import { formatDecimal, getStatusStyles, ratioStatusLabel } from "../utils";
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
            ? `${formatDecimal(ratio.value, 2)} ${ratio.unit}`
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
          Target ≤ {formatDecimal(ratio.target, 2)} {ratio.unit}
        </ThemedText>
      )}
      <ThemedText style={styles.helperText}>
        Based on the meals you logged this week.
      </ThemedText>
    </Card>
  );
}
