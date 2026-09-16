import { StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  consentCard: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 18,
    gap: 8,
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
  errorText: {
    fontSize: 13,
    color: theme.colors.dangerDark,
  },
  fieldBlock: {
    gap: 8,
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
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: "top",
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
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  primaryButtonPressed: {
    backgroundColor: theme.colors.primaryPressed,
  },
  primaryButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  screenContent: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  secondaryButton: {
    backgroundColor: theme.colors.control,
  },
  secondaryButtonPressed: {
    backgroundColor: theme.colors.controlPressed,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 16,
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
  selectionPlaceholder: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  selectionValue: {
    fontSize: 16,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.onBackground,
  },
  tertiaryDangerButton: {
    backgroundColor: theme.colors.dangerSoft,
  },
  tertiaryDangerButtonPressed: {
    backgroundColor: theme.colors.danger,
  },
  tertiaryDangerButtonText: {
    color: theme.colors.dangerDark,
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.onBackground,
  },
});
