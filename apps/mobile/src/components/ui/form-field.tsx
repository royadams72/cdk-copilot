import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

import { theme } from "@/constants/theme";

export function FormField({
  children,
  containerStyle,
  description,
  error,
  label,
  required = false,
}: {
  children: ReactNode;
  containerStyle?: ViewStyle;
  description?: string;
  error?: string;
  label?: string;
  required?: boolean;
}) {
  return (
    <View style={[styles.block, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function TextField({
  description,
  containerStyle,
  error,
  label,
  multiline,
  required,
  hideLabel = false,
  style,
  ...props
}: TextInputProps & {
  description?: string;
  containerStyle?: ViewStyle;
  error?: string;
  hideLabel?: boolean;
  label: string;
  required?: boolean;
}) {
  return (
    <View style={containerStyle}>
      <FormField label={hideLabel ? undefined : label} description={description} error={error} required={required}>
      <TextInput
        accessibilityLabel={label}
        placeholder={props.placeholder ?? label}
        placeholderTextColor={theme.colors.textMuted}
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, error && styles.inputError, style]}
      />
      </FormField>
    </View>
  );
}

export const formControlStyles = StyleSheet.create({
  shell: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    minHeight: theme.controls.height,
  },
  shellError: { borderColor: theme.colors.dangerDark },
});

const styles = StyleSheet.create({
  block: { gap: theme.spacing.sm },
  label: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  required: { color: theme.colors.dangerDark },
  description: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: theme.colors.dangerDark, fontSize: 13 },
  input: {
    ...formControlStyles.shell,
    color: theme.colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputError: formControlStyles.shellError,
  multiline: { minHeight: 100, textAlignVertical: "top" },
});
