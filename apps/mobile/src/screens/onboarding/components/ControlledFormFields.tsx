import type { ComponentProps } from "react";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

import { DateField } from "./DateField";
import { LabeledInput, OptionSelectField } from "./FormFields";

function isDateValue(value: unknown): value is Date {
  return value instanceof Date;
}

type TextFieldProps = Omit<
  ComponentProps<typeof LabeledInput>,
  "error" | "onBlur" | "onChangeText" | "value"
>;

export function ControlledTextField<
  TValues extends FieldValues,
  TTransformedValues extends FieldValues = TValues,
>({
  control,
  name,
  onFieldBlur,
  ...props
}: TextFieldProps & {
  control: Control<TValues, unknown, TTransformedValues>;
  name: Path<TValues>;
  onFieldBlur?: () => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onBlur, onChange, value }, fieldState }) => (
        <LabeledInput
          {...props}
          error={fieldState.error?.message}
          onBlur={() => {
            onBlur();
            onFieldBlur?.();
          }}
          onChangeText={onChange}
          value={value == null ? "" : String(value)}
        />
      )}
    />
  );
}

export function ControlledOptionField<
  TValues extends FieldValues,
  TValue extends string,
  TTransformedValues extends FieldValues = TValues,
>({
  control,
  name,
  label,
  options,
  onValueChange,
  placeholder,
  toFormValue,
}: {
  control: Control<TValues, unknown, TTransformedValues>;
  label: string;
  name: Path<TValues>;
  options: { label: string; value: TValue }[];
  onValueChange?: () => void;
  placeholder?: string;
  toFormValue?: (value: TValue) => unknown;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <OptionSelectField
          error={fieldState.error?.message}
          label={label}
          onChange={(nextValue) => {
            onChange(toFormValue ? toFormValue(nextValue) : nextValue);
            onValueChange?.();
          }}
          options={options}
          placeholder={placeholder}
          value={(value ?? undefined) as TValue | undefined}
        />
      )}
    />
  );
}

export function ControlledDateField<
  TValues extends FieldValues,
  TTransformedValues extends FieldValues = TValues,
>({
  control,
  label,
  name,
  onValueChange,
  toFormValue,
}: {
  control: Control<TValues, unknown, TTransformedValues>;
  label: string;
  name: Path<TValues>;
  onValueChange?: () => void;
  toFormValue?: (value: string | null) => unknown;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <DateField
          error={fieldState.error?.message}
          label={label}
          onChange={(nextValue) => {
            onChange(toFormValue ? toFormValue(nextValue) : nextValue);
            onValueChange?.();
          }}
          value={
            isDateValue(value) || typeof value === "string"
              ? value
              : null
          }
        />
      )}
    />
  );
}
