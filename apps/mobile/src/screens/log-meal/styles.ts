import { StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export const logMealStyles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.5,
  },
  contentContainer: {
    paddingBottom: theme.spacing.lg,
  },
  contentScroll: {
    flex: 1,
  },
  controlCard: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  controlField: {
    flex: 1,
    gap: 6,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  controlRow: {
    flexDirection: "row",
    gap: 12,
  },
  emptyState: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 6,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  fixedFooter: {
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 10,
  },
  fixedHeader: {
    gap: 12,
    paddingBottom: 12,
  },
  footerDangerButton: {
    backgroundColor: theme.colors.danger,
  },
  footerPrimaryButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerPrimaryButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  footerPrimaryInlineButton: {
    backgroundColor: theme.colors.primary,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  footerButtonCell: {
    flex: 1,
  },
  footerSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.control,
  },
  footerSecondaryButtonText: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  footerSecondaryButtonTextLight: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
  },
  listCard: {
    marginBottom: 10,
  },
  detailsWrap: {
    gap: 16,
    marginBottom: 16,
  },
  dateRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.panelHeader,
  },
  dateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.infoSoft,
  },
  dateButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  logButton: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.info,
    marginBottom: 10,
  },
  logButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  searchButton: {
    minWidth: 104,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  searchButtonText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
  },
  searchErrorBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchErrorText: {
    color: theme.colors.dangerDark,
    fontSize: 13,
    fontWeight: "600",
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
  },
  searchField: { flex: 1 },
  searchPanel: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  searchWrap: {
    flexDirection: "row",
    gap: 10,
  },
  section: {
    gap: 4,
  },
  screenContent: {
    paddingBottom: 32,
  },
  screenScroll: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: theme.colors.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  tabButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: theme.colors.onPrimary,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
  },
  toast: {
    backgroundColor: theme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  toastText: {
    color: theme.colors.surface,
    fontWeight: "700",
  },
  toastWrap: {
    position: "absolute",
    left: 15,
    right: 15,
    bottom: 135,
    alignItems: "center",
  },
  helperText: {
    fontSize: 13,
    color: theme.colors.copy,
  },
  estimateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.warning,
  },
  estimateBannerText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.warningDark,
    fontWeight: "600",
  },
  estimateIconButton: {
    padding: 2,
  },
  nutrientLabelWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 12,
  },
  nutrientList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  nutrientLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  nutrientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  nutrientValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  pickerShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    maxHeight: "78%",
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    padding: 18,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  modalWarning: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.warningDark,
    fontWeight: "600",
  },
  modalBody: {
    maxHeight: 360,
  },
  modalRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 4,
  },
  modalIngredient: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  modalFormula: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  modalMatchedFood: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  modalEmptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  modalMissingText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.warningDark,
    fontWeight: "600",
  },
});
