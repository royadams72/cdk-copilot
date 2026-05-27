import React from "react";
import { Button, Text, View } from "react-native";

export function Section({
  title,
  description,
  emptyLabel,
  addLabel,
  onAdd,
  children,
}: {
  addLabel: string;
  children: React.ReactNode;
  description?: string;
  emptyLabel: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: "700" }}>{title}</Text>
      {description ? <Text style={{ color: "#555" }}>{description}</Text> : null}
      {React.Children.count(children) === 0 ? (
        <Text style={{ color: "#555" }}>{emptyLabel}</Text>
      ) : (
        children
      )}
      {addLabel ? <Button title={addLabel} onPress={onAdd} /> : null}
    </View>
  );
}
