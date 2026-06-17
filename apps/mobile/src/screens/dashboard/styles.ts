import { StyleSheet } from "react-native";
import { STACKED_SIZE } from "./constants";

export const styles = StyleSheet.create({
  accordionArrow: {
    fontSize: 30,
    fontWeight: "700",
  },
  accordionArrowClosed: {
    transform: [{ rotate: "0deg" }],
  },
  accordionArrowOpen: {
    transform: [{ rotate: "90deg" }],
  },
  accordionBody: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  accordionHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardDark: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardLight: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  carePlanBodyText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  carePlanListRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
    gap: 4,
  },
  carePlanListTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  carePlanMetaLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    opacity: 0.72,
  },
  carePlanMetaValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  carePlanNotificationCard: {
    borderColor: "rgba(37,99,235,0.28)",
    backgroundColor: "rgba(37,99,235,0.08)",
  },
  carePlanSection: {
    gap: 6,
  },
  carePlanStatusText: {
    color: "#65A30D",
    fontSize: 16,
    fontWeight: "700",
  },
  carePlanSummaryCell: {
    flex: 1,
    gap: 6,
    minWidth: "45%",
  },
  carePlanSummaryCellWide: {
    flexBasis: "100%",
    gap: 6,
  },
  carePlanSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  carePlanTaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  carePlanTaskMeta: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.72,
  },
  carePlanViewButton: {
    marginTop: 4,
  },
  centerLabel: {
    position: "absolute",
    fontSize: 16,
    fontWeight: "600",
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
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
  header: {
    gap: 4,
  },
  helperText: {
    fontSize: 13,
    opacity: 0.7,
  },
  labLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  labRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
  },
  labSubtext: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  labUnit: {
    fontSize: 12,
    opacity: 0.7,
  },
  labValue: {
    fontSize: 22,
    fontWeight: "600",
  },
  labValueWrap: {
    alignItems: "flex-end",
  },
  legendColumn: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  legendColumnCompact: {
    width: "100%",
  },
  legendCopy: {
    flex: 1,
    minWidth: 0,
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
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  legendSubtext: {
    fontSize: 13,
    opacity: 0.75,
    flexShrink: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  medActionsRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
  },
  medEditButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  medEditButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  medSummaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  medSummaryMeta: {
    fontSize: 13,
    opacity: 0.75,
  },
  medSummaryRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
    gap: 2,
  },
  medSummaryTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  primaryActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(16,185,129,0.16)",
  },
  primaryActionText: {
    fontWeight: "700",
    color: "#065F46",
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
  secondaryActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  secondaryActionText: {
    fontWeight: "700",
    color: "#1E3A8A",
  },
  selectableCard: {
    borderRadius: 16,
  },
  stackedChart: {
    width: STACKED_SIZE,
    height: STACKED_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  stackedChartWrap: {
    width: STACKED_SIZE,
    height: STACKED_SIZE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stackedChartWrapCompact: {
    width: "100%",
  },
  stackedHeader: {
    gap: 2,
  },
  stackedLayout: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  stackedLayoutCompact: {
    flexDirection: "column",
    alignItems: "center",
  },
  stackedRadialCard: {
    paddingBottom: 20,
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
  subtleText: {
    opacity: 0.7,
  },
});
