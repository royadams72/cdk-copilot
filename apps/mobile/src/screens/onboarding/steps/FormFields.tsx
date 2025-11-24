import React from "react";
import {
  Button,
  Platform,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

export function LabeledInput({
  label,
  error,
  multiline,
  ...props
}: {
  label: string;
  error?: string;
  multiline?: boolean;
} & TextInputProps) {
  return (
    <View>
      <Text>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={{
          borderWidth: 1,
          borderRadius: 8,
          padding: 10,
          minHeight: multiline ? 80 : undefined,
        }}
      />
      {!!error && <Text style={{ color: "red" }}>{error}</Text>}
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
}) {
  const [show, setShow] = React.useState(false);
  const dateVal = value ? new Date(value) : null;

  return (
    <View>
      <Text>{label}</Text>
      <Text
        onPress={() => setShow(true)}
        style={{
          borderWidth: 1,
          borderRadius: 8,
          padding: 10,
          color: dateVal ? "black" : "#666",
        }}
      >
        {dateVal ? dateVal.toISOString().slice(0, 10) : "Tap to select"}
      </Text>
      {show && (
        <DateTimePicker
          value={dateVal ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, selected) => {
            setShow(Platform.OS === "ios");
            if (selected) {
              const iso = new Date(
                Date.UTC(
                  selected.getFullYear(),
                  selected.getMonth(),
                  selected.getDate()
                )
              ).toISOString();
              onChange(iso);
            }
          }}
        />
      )}
      {Platform.OS === "ios" && show && (
        <Button title="Done" onPress={() => setShow(false)} />
      )}
      {value && <Button title="Clear date" onPress={() => onChange(null)} />}
    </View>
  );
}
