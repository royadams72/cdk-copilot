import { StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionsRowEnd: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  bodyText: {
    color: theme.colors.onBackground,
    fontSize: 15,
    lineHeight: 22,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkboxTick: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
  },
  consentLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  consentMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  consentValue: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  datePickerColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 92,
    justifyContent: "space-between",
  },
  datePickerColumnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  datePickerRow: {
    flexDirection: "row",
    gap: 8,
  },
  editorCard: {
    borderColor: theme.colors.borderOnBackground,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.dangerOnBackground,
  },
  fieldBlock: {
    gap: 8,
  },
  flexItem: {
    flex: 1,
  },
  flexItemGap: {
    flex: 1,
    gap: 4,
  },
  formSection: {
    gap: 12,
  },
  header: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: theme.colors.surfaceMuted,
    fontSize: 16,
    color: theme.colors.text,
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.onBackground,
  },
  loadingBlock: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  modalCardTall: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    gap: 14,
    maxHeight: "80%",
    padding: 18,
  },
  modalContent: {
    gap: 12,
    paddingBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  optionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
  },
  optionItemSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  optionItemText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  optionItemTextSelected: {
    fontWeight: "700",
    color: theme.colors.primary,
  },
  optionList: {
    maxHeight: 220,
  },
  optionListContent: {
    gap: 8,
  },
  optionPanel: {
    gap: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: theme.colors.borderSubtle,
  },
  optionPanelTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textTransform: "capitalize",
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  pickerShell: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  pickerValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 24,
  },
  repeatableCard: {
    borderColor: theme.colors.borderOnBackground,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  screenContent: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 50,
  },
  sectionTitle: {
    color: theme.colors.onBackground,
    fontSize: 18,
    fontWeight: "700",
  },
  selectionField: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 15,
    backgroundColor: theme.colors.surfaceMuted,
  },
  selectionFieldPressed: {
    opacity: 0.82,
  },
  selectionOption: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectionOptionSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  selectionOptionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  selectionPlaceholder: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  selectionValue: {
    fontSize: 16,
    color: theme.colors.text,
  },
  splitRow: {
    flexDirection: "row",
    gap: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.onBackground,
  },
  summaryButton: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.tertiary,
    borderColor: theme.colors.borderOnBackground,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.onBackground,
  },
  summaryButtonText: {
    color: theme.colors.text,
    fontWeight: "600",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.onBackground,
  },
});
