import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { PLACEHOLDER_COLOR, styles } from "../styles";
import { PrimaryButton, SecondaryButton } from "./Buttons";

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

export function OptionSelectField<TValue extends string>({
  label,
  value,
  options,
  onChange,
  error,
  placeholder,
}: {
  error?: string;
  label: string;
  onChange: (value: TValue) => void;
  options: { label: string; value: TValue }[];
  placeholder?: string;
  value?: TValue;
}) {
  const [visible, setVisible] = React.useState(false);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? null;

  return (
    <>
      <SelectionField
        label={label}
        value={selectedLabel}
        placeholder={placeholder ?? label}
        onPress={() => setVisible(true)}
        error={error}
      />
      <Modal
        transparent
        animationType="fade"
        visible={visible}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView
              nestedScrollEnabled
              style={styles.optionList}
              contentContainerStyle={styles.optionListContent}
            >
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setVisible(false);
                    }}
                    style={[
                      styles.optionItem,
                      selected ? styles.optionItemSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionItemText,
                        selected ? styles.optionItemTextSelected : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.actionsRow}>
              <SecondaryButton label="Close" onPress={() => setVisible(false)} />
              <PrimaryButton
                label="Done"
                onPress={() => setVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
