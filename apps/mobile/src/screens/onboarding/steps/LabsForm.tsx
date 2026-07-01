import React from "react";
import { Button, Text, View } from "react-native";
import {
  Controller,
  useFieldArray,
  useForm,
  type Resolver,
} from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { TLabsFormValues, LabsSchema } from "@ckd/core";
import { useRouter } from "expo-router";
import { PrimaryButton } from "../components/Buttons";
import { DateField } from "../components/DateField";
import { LabeledInput, OptionSelectField } from "../components/FormFields";
import { OnboardingFormScreen } from "../components/Onboarding";

const emptyLab: TLabsFormValues["labs"][number] = {
  code: "",
  name: "",
  value: "",
  unit: "",
  refRangeLow: "",
  refRangeHigh: "",
  refRangeText: "",
  takenAt: null,
  reportedAt: null,
  source: "manual",
  status: "final",
  sourceAbnormalFlag: null,
  note: "",
};

const LAB_SOURCE_OPTIONS = [
  { label: "Manual", value: "manual" },
  { label: "Import", value: "import" },
  { label: "Integration", value: "integration" },
] as const;

const LAB_STATUS_OPTIONS = [
  { label: "Final", value: "final" },
  { label: "Corrected", value: "corrected" },
  { label: "Preliminary", value: "preliminary" },
  { label: "Cancelled", value: "cancelled" },
] as const;

const LAB_ABNORMAL_FLAG_OPTIONS = [
  { label: "None", value: "" },
  { label: "Low (L)", value: "L" },
  { label: "Critical low (LL)", value: "LL" },
  { label: "High (H)", value: "H" },
  { label: "Critical high (HH)", value: "HH" },
  { label: "Abnormal (A)", value: "A" },
  { label: "Normal (N)", value: "N" },
] as const;

export default function LabsForm({
  defaults,
}: {
  defaults?: Partial<TLabsFormValues>;
}) {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TLabsFormValues>({
    resolver: zodResolver(LabsSchema) as Resolver<TLabsFormValues>,
    defaultValues: {
      labs: defaults?.labs?.length ? defaults.labs : [emptyLab],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "labs",
  });

  async function onSubmit(values: TLabsFormValues) {
    const payload = values.labs.map((lab) => {
      const refRange =
        lab.refRangeLow || lab.refRangeHigh || lab.refRangeText
          ? {
              low:
                lab.refRangeLow?.trim() && !Number.isNaN(+lab.refRangeLow)
                  ? Number(lab.refRangeLow)
                  : undefined,
              high:
                lab.refRangeHigh?.trim() && !Number.isNaN(+lab.refRangeHigh)
                  ? Number(lab.refRangeHigh)
                  : undefined,
              text: lab.refRangeText?.trim() || undefined,
            }
          : undefined;

      const parsedValue = Number(lab.value);
      if (typeof lab.value === "string") {
      }
      const value =
        typeof lab.value === "string" && lab.value.trim() === ""
          ? ""
          : parsedValue;

      return {
        code: lab.code.trim(),
        name: lab.name.trim(),
        value,
        unit: lab.unit?.trim() || undefined,
        refRange,
        takenAt: lab.takenAt ?? undefined,
        reportedAt: lab.reportedAt ?? undefined,
        source: lab.source,
        status: lab.status,
        sourceAbnormalFlag: lab.sourceAbnormalFlag ?? undefined,
        note: lab.note?.trim() || undefined,
      };
    });
    router.push("/(auth)/onboarding/clinical-form");
  }

  return (
    <OnboardingFormScreen contentContainerStyle={{ gap: 24 }}>
      {fields.map((field, index) => {
        const base = `labs.${index}` as const;
        const labErrors = errors.labs?.[index];

        return (
          <View
            key={field.id}
            style={{ borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 }}
          >
            <Text style={{ fontWeight: "700" }}>Lab result {index + 1}</Text>

            <Controller
              control={control}
              name={`${base}.code`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Test code"
                  value={value}
                  onChangeText={onChange}
                  placeholder="33914-3"
                  error={labErrors?.code?.message as string | undefined}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.name`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  placeholder="eGFR"
                  error={labErrors?.name?.message as string | undefined}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.value`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Value"
                  value={
                    value !== undefined && value !== null ? String(value) : ""
                  }
                  onChangeText={onChange}
                  placeholder="42"
                  error={labErrors?.value?.message as string | undefined}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.unit`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Unit"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="mL/min/1.73m²"
                />
              )}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name={`${base}.refRangeLow`}
                  render={({ field: { value, onChange } }) => (
                    <LabeledInput
                      label="Ref range (low)"
                      value={value ?? ""}
                      onChangeText={onChange}
                      placeholder="60"
                    />
                  )}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name={`${base}.refRangeHigh`}
                  render={({ field: { value, onChange } }) => (
                    <LabeledInput
                      label="Ref range (high)"
                      value={value ?? ""}
                      onChangeText={onChange}
                      placeholder="90"
                    />
                  )}
                />
              </View>
            </View>

            <Controller
              control={control}
              name={`${base}.refRangeText`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Ref range (text)"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder=">= 60"
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.source`}
              render={({ field: { value, onChange } }) => (
                <OptionSelectField
                  label="Source"
                  value={value}
                  options={[...LAB_SOURCE_OPTIONS]}
                  onChange={onChange}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.status`}
              render={({ field: { value, onChange } }) => (
                <OptionSelectField
                  label="Status"
                  value={value}
                  options={[...LAB_STATUS_OPTIONS]}
                  onChange={onChange}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.sourceAbnormalFlag`}
              render={({ field: { value, onChange } }) => (
                <OptionSelectField
                  label="Abnormal flag"
                  value={(value ?? "") as "" | "L" | "LL" | "H" | "HH" | "A" | "N"}
                  options={[...LAB_ABNORMAL_FLAG_OPTIONS]}
                  onChange={(nextValue) =>
                    onChange(nextValue === "" ? null : nextValue)
                  }
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.note`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Note"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="Operational note"
                  multiline
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.takenAt`}
              render={({ field: { value, onChange } }) => (
                <DateField
                  label="Sample collected"
                  value={value ? value.toISOString() : null}
                  onChange={(nextValue: string | null) =>
                    onChange(nextValue ? new Date(nextValue) : null)
                  }
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.reportedAt`}
              render={({ field: { value, onChange } }) => (
                <DateField
                  label="Result reported"
                  value={value ? value.toISOString() : null}
                  onChange={(nextValue: string | null) =>
                    onChange(nextValue ? new Date(nextValue) : null)
                  }
                />
              )}
            />

            {fields.length > 1 && (
              <Button
                color="#b91c1c"
                title="Remove lab"
                onPress={() => remove(index)}
              />
            )}
          </View>
        );
      })}

      <Button title="Add lab" onPress={() => append({ ...emptyLab })} />

      {typeof errors.labs?.message === "string" && (
        <Text style={{ color: "red" }}>{errors.labs.message}</Text>
      )}

      <PrimaryButton
        label={isSubmitting ? "Saving..." : "Save labs"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </OnboardingFormScreen>
  );
}
