import { StyleSheet } from "react-native";
const BORDER_COLOR = "rgba(148,163,184,0.45)";
const SURFACE_COLOR = "#FFFFFF";
const SUBTLE_SURFACE_COLOR = "#F8FAFC";
const PRIMARY_COLOR = "#0F766E";
const PRIMARY_COLOR_PRESSED = "#115E59";
const PRIMARY_TEXT_COLOR = "#FFFFFF";
const GHOST_SURFACE = "rgba(15,23,42,0.08)";
const GHOST_TEXT = "#0F172A";
const DANGER_SURFACE = "rgba(185,28,28,0.1)";
const DANGER_SURFACE_PRESSED = "rgba(185,28,28,0.16)";
const DANGER_TEXT = "#B91C1C";
const ERROR_TEXT = "#B91C1C";
export const PLACEHOLDER_COLOR = "#64748B";
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
  datePickerColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 14,
    backgroundColor: SUBTLE_SURFACE_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 92,
    justifyContent: "space-between",
  },
  datePickerColumnActive: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: "rgba(15,118,110,0.08)",
  },
  datePickerRow: {
    flexDirection: "row",
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: ERROR_TEXT,
  },
  fieldBlock: {
    gap: 8,
  },
  header: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: SUBTLE_SURFACE_COLOR,
    fontSize: 16,
    color: "#0F172A",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#475569",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  pickerValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 24,
  },
  pickerShell: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: SUBTLE_SURFACE_COLOR,
  },
  optionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  optionItemSelected: {
    backgroundColor: "rgba(15,118,110,0.12)",
  },
  optionItemText: {
    fontSize: 15,
    color: "#0F172A",
  },
  optionItemTextSelected: {
    fontWeight: "700",
    color: PRIMARY_COLOR,
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
    backgroundColor: "rgba(148,163,184,0.12)",
  },
  optionPanelTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    textTransform: "capitalize",
  },
  primaryButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  primaryButtonPressed: {
    backgroundColor: PRIMARY_COLOR_PRESSED,
  },
  primaryButtonText: {
    color: PRIMARY_TEXT_COLOR,
    fontSize: 16,
    fontWeight: "700",
  },
  screen: {
    flex: 1,
    backgroundColor: SURFACE_COLOR,
  },
  screenContent: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  secondaryButton: {
    backgroundColor: GHOST_SURFACE,
  },
  secondaryButtonPressed: {
    backgroundColor: "rgba(15,23,42,0.14)",
  },
  secondaryButtonText: {
    color: GHOST_TEXT,
    fontSize: 16,
    fontWeight: "700",
  },
  tertiaryDangerButton: {
    backgroundColor: DANGER_SURFACE,
  },
  tertiaryDangerButtonPressed: {
    backgroundColor: DANGER_SURFACE_PRESSED,
  },
  tertiaryDangerButtonText: {
    color: DANGER_TEXT,
    fontSize: 16,
    fontWeight: "700",
  },
  selectionField: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 15,
    backgroundColor: SUBTLE_SURFACE_COLOR,
  },
  selectionFieldPressed: {
    opacity: 0.82,
  },
  selectionPlaceholder: {
    fontSize: 16,
    color: PLACEHOLDER_COLOR,
  },
  selectionValue: {
    fontSize: 16,
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0F172A",
  },
});
