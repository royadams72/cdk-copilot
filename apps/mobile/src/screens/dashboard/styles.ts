import { StyleSheet } from "react-native";
import { STACKED_SIZE } from "./constants";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  header: {
    gap: 4,
  },
  subtleText: {
    opacity: 0.7,
  },
  stackedRadialCard: {
    paddingBottom: 20,
  },
  stackedHeader: {
    gap: 2,
  },
  stackedLayout: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  legendColumn: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  legendSubtext: {
    fontSize: 13,
    opacity: 0.75,
  },
  stackedChartWrap: {
    width: STACKED_SIZE,
    height: STACKED_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  stackedChart: {
    width: STACKED_SIZE,
    height: STACKED_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    fontSize: 16,
    fontWeight: "600",
  },
  helperText: {
    fontSize: 13,
    opacity: 0.7,
  },
  ratioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ratioValue: {
    fontSize: 24,
    fontWeight: "600",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  labRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
  },
  labLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  labSubtext: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  labValueWrap: {
    alignItems: "flex-end",
  },
  labValue: {
    fontSize: 22,
    fontWeight: "600",
  },
  labUnit: {
    fontSize: 12,
    opacity: 0.7,
  },
  flagPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(234,179,8,0.25)",
  },
  flagPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#854D0E",
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardLight: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  cardDark: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  retryButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(79,70,229,0.15)",
  },
  retryText: {
    fontWeight: "600",
  },
});
