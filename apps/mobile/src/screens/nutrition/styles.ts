import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  navButtonText: {
    fontWeight: "600",
  },
  logButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#8B5CF6",
  },
  logButtonText: {
    fontWeight: "600",
    color: "#fff",
  },
  helperText: {
    fontSize: 13,
    opacity: 0.7,
  },
  cardHeader: {
    marginBottom: 8,
    gap: 2,
  },
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  legendMetric: {
    fontSize: 16,
    fontWeight: "600",
  },
  legendValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  chartWrap: {
    marginTop: 8,
    alignItems: "center",
  },
  chartInner: {
    position: "relative",
  },
  targetBadge: {
    alignSelf: "flex-end",
    marginTop: -24,
    backgroundColor: "rgba(99,102,241,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  targetBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4C1D95",
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  metricButtonText: {
    fontWeight: "600",
    color: "#111827",
  },
  metricButtonTextActive: {
    color: "#fff",
  },
  foodList: {
    gap: 16,
    marginTop: 8,
  },
  summaryGrid: {
    gap: 12,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.75,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  foodRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  foodMeta: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  foodAmount: {
    fontWeight: "700",
    fontSize: 16,
  },
  retryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  retryText: {
    fontWeight: "600",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
});
