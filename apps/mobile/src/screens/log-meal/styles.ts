import { StyleSheet } from "react-native";

export const logMealStyles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.5,
  },
  contentContainer: {
    paddingBottom: 180,
  },
  contentScroll: {
    flex: 1,
  },
  controlCard: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  controlField: {
    flex: 1,
    gap: 6,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  controlRow: {
    flexDirection: "row",
    gap: 12,
  },
  emptyState: {
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
    gap: 6,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  fixedFooter: {
    position: "absolute",
    left: 15,
    right: 15,
    bottom: 15,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 10,
  },
  fixedHeader: {
    gap: 12,
    paddingBottom: 12,
  },
  footerDangerButton: {
    backgroundColor: "#dc2626",
  },
  footerPrimaryButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  footerPrimaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  footerPrimaryInlineButton: {
    backgroundColor: "#0f766e",
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  footerSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  footerSecondaryButtonText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  footerSecondaryButtonTextLight: {
    color: "#fff",
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
    color: "#475569",
  },
  dateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  dateButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  logButton: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#1e90ff",
    marginBottom: 10,
  },
  logButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  searchButton: {
    minWidth: 104,
    borderRadius: 14,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    backgroundColor: "#fff",
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
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    backgroundColor: "#111827",
  },
  tabButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#fff",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
  },
  toast: {
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  toastText: {
    color: "#fff",
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
    color: "#64748b",
  },
  nutrientList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  nutrientLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
    paddingRight: 12,
  },
  nutrientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  nutrientValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  pickerShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
});
