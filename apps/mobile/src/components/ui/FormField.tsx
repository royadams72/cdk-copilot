import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";

import { theme } from "@/constants/theme";
import { SurfaceTone, useSurfaceTone } from "../SurfaceToneContext";

export function FormField({
  children,
  containerStyle,
  description,
  error,
  label,
  tone,
  required = false,
}: {
  children: ReactNode;
  containerStyle?: ViewStyle;
  description?: string;
  error?: string;
  label?: string;
  required?: boolean;
  tone?: SurfaceTone;
}) {
  const inheritedTone = useSurfaceTone();
  const resolvedTone = tone ?? inheritedTone;
  return (
    <View style={[styles.block, containerStyle]}>
      {label ? (
        <Text
          style={[
            styles.label,
            resolvedTone === "background" ? styles.textOnBackground : null,
          ]}
        >
          {label}
          {required ? (
            <Text
              style={[
                styles.required,
                resolvedTone === "background" ? styles.errorOnBackground : null,
              ]}
            >
              {" *"}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {description ? (
        <Text
          style={[
            styles.description,
            resolvedTone === "background" ? styles.textOnBackground : null,
          ]}
        >
          {description}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.error,
            resolvedTone === "background" ? styles.errorOnBackground : null,
          ]}
        >
          {error}
        </Text>
      ) : null}
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
  tone,
  ...props
}: TextInputProps & {
  containerStyle?: ViewStyle;
  description?: string;
  error?: string;
  hideLabel?: boolean;
  label: string;
  required?: boolean;
  tone?: SurfaceTone;
}) {
  return (
    <View style={containerStyle}>
      <FormField
        label={hideLabel ? undefined : label}
        description={description}
        error={error}
        required={required}
        tone={tone}
      >
        <TextInput
          accessibilityLabel={label}
          placeholder={props.placeholder ?? label}
          placeholderTextColor={theme.colors.textMuted}
          {...props}
          multiline={multiline}
          style={[
            styles.input,
            multiline && styles.multiline,
            error && styles.inputError,
            style,
          ]}
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
  description: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  error: { color: theme.colors.dangerDark, fontSize: 13 },
  errorOnBackground: { color: theme.colors.dangerOnBackground },
  input: {
    ...formControlStyles.shell,
    color: theme.colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputError: formControlStyles.shellError,
  label: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  required: { color: theme.colors.dangerDark },
  textOnBackground: { color: theme.colors.onBackground },
});
