import { StyleSheet } from "react-native";

export const logMealStyles = StyleSheet.create({
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
  screenContent: {
    paddingBottom: 32,
  },
  screenScroll: {
    flex: 1,
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
