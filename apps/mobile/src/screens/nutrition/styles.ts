import { StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export const NutritionStyles = StyleSheet.create({
  addMealsButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  addMealsButtonText: {
    fontWeight: "600",
    color: theme.colors.onPrimary,
  },
  cardHeader: {
    marginBottom: 8,
    gap: 2,
  },
  chartInner: {
    position: "relative",
  },
  chartTouchLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  chartTouchTarget: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "transparent",
  },
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartLegendRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  legendTarget: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.chart.target,
  },
  chartWrap: {
    marginTop: 8,
    alignItems: "center",
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  editMealsButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.infoSoft,
  },
  editMealsButtonText: {
    fontWeight: "600",
    color: theme.colors.text,
  },
  foodAmount: {
    fontWeight: "700",
    fontSize: 16,
  },
  foodList: {
    gap: 16,
    marginTop: 8,
  },
  foodMeta: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  foodRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  header: {
    gap: 8,
  },
  helperText: {
    fontSize: 13,
    opacity: 0.7,
  },
  legendMetric: {
    fontSize: 16,
    fontWeight: "600",
  },
  legendValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  logButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  logButtonText: {
    fontWeight: "600",
    color: theme.colors.onPrimary,
  },
  mealEditHint: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primaryPressed,
  },
  mealItemsText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  mealList: {
    gap: 10,
    marginTop: 4,
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.control,
  },
  metricButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.control,
  },
  metricButtonText: {
    fontWeight: "600",
    color: theme.colors.text,
  },
  metricButtonTextActive: {
    color: theme.colors.onPrimary,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthlyChartFrame: {
    position: "relative",
  },
  monthlyChartTouchLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  monthlyChartTouchTarget: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  monthlyChartWrap: {
    marginTop: 8,
    alignItems: "center",
  },
  monthlyFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderSubtle,
  },
  modalActions: {
    gap: 10,
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "center",
    padding: 24,
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  modalButtonDelete: {
    backgroundColor: theme.colors.danger,
  },
  modalButtonGhost: {
    backgroundColor: theme.colors.control,
  },
  modalButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonTextGhost: {
    fontWeight: "600",
    color: theme.colors.text,
  },
  modalButtonTextPrimary: {
    color: theme.colors.onPrimary,
    fontWeight: "600",
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    maxHeight: "80%",
    padding: 20,
    gap: 10,
  },
  modalScroll: {
    maxHeight: 420,
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.control,
  },
  navButtonText: {
    fontWeight: "600",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  retryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.infoSoft,
  },
  retryText: {
    fontWeight: "600",
  },
  screen: {
    flex: 1,
    padding: 15,
  },
  summaryGrid: {
    gap: 12,
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.75,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  targetBadge: {
    alignSelf: "flex-end",
    marginTop: -24,
    backgroundColor: theme.colors.infoSoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  targetBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primaryPressed,
  },
});
