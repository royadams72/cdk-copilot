import { StyleSheet } from "react-native";
import { STACKED_SIZE } from "./constants";
import { theme } from "@/constants/theme";

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
    borderColor: theme.colors.borderSubtle,
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
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardDark: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceMuted,
  },
  cardLight: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  carePlanBodyText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  carePlanListRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderSubtle,
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
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.infoSoft,
  },
  carePlanReviewCard: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
  },
  carePlanSection: {
    gap: 6,
  },
  carePlanStatusText: {
    color: theme.colors.successDark,
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
  carePlanTaskAction: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.info,
    marginTop: 2,
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
    fontSize: 13,
    fontWeight: "600",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.infoSoft,
    borderColor: theme.colors.info,
  },
  checkboxTick: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.info,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  flagPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.warningSoft,
  },
  flagPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.warningDark,
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
    borderColor: theme.colors.borderSubtle,
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
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  legendColumnCompact: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  legendCopy: {
    flex: 1,
    minWidth: 0,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    marginTop: 5,
  },
  legendLabel: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  legendRowCompact: {
    width: "48%",
  },
  legendSubtext: {
    fontSize: 12,
    opacity: 0.75,
    lineHeight: 18,
  },
  legendText: {
    fontSize: 14,
    lineHeight: 18,
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
    backgroundColor: theme.colors.infoSoft,
  },
  medEditButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.infoDark,
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
    borderColor: theme.colors.borderSubtle,
    gap: 2,
  },
  medSummaryTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  membershipNoticeCard: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
  },
  multilineInput: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    textAlignVertical: "top",
  },
  primaryActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.successSoft,
  },
  primaryActionText: {
    fontWeight: "700",
    color: theme.colors.successDark,
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
    backgroundColor: theme.colors.infoSoft,
  },
  secondaryActionText: {
    fontWeight: "700",
    color: theme.colors.infoDark,
  },
  selectableCard: {
    borderRadius: 16,
  },
  selectableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  selectedOptionCard: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.infoSoft,
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
    gap: theme.spacing.md,
    alignItems: "flex-start",
  },
  stackedLayoutCompact: {
    flexDirection: "column",
    alignItems: "center",
  },
  stackedRadialCard: {
    paddingBottom: theme.spacing.md,
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
