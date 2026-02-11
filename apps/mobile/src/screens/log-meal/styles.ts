import { StyleSheet } from "react-native";

export const logMealStyles = StyleSheet.create({
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
});
