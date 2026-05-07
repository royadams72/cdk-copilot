import React from "react";
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { PLACEHOLDER_COLOR, styles } from "../styles";

function FieldMessage({ error }: { error?: string }) {
  if (!error) return null;
  return <Text style={styles.errorText}>{error}</Text>;
}

export function LabeledInput({
  label,
  error,
  multiline,
  style,
  ...props
}: {
  error?: string;
  label: string;
  multiline?: boolean;
} & TextInputProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholder={label}
        placeholderTextColor={PLACEHOLDER_COLOR}
        style={[styles.input, multiline ? styles.multilineInput : null, style]}
      />
      <FieldMessage error={error} />
    </View>
  );
}

export function PickerField({
  label,
  error,
  children,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerShell}>{children}</View>
      <FieldMessage error={error} />
    </View>
  );
}

export function SelectionField({
  label,
  value,
  placeholder,
  onPress,
  error,
}: {
  error?: string;
  label: string;
  onPress: () => void;
  placeholder?: string;
  value?: string | null;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.selectionField,
          pressed ? styles.selectionFieldPressed : null,
        ]}
      >
        <Text
          style={value ? styles.selectionValue : styles.selectionPlaceholder}
        >
          {value || placeholder || label}
        </Text>
      </Pressable>
      <FieldMessage error={error} />
    </View>
  );
}
