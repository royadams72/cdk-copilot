import React from "react";
import { Text, View } from "react-native";
import {
  Controller,
  type Resolver,
  useFieldArray,
  useForm,
} from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { MedicationsFormSchema, TMedicationFormValues } from "@ckd/core";
import { useRouter } from "expo-router";
import { AppButton, PrimaryButton } from "../components/Buttons";
import { DateField } from "../components/DateField";
import { LabeledInput, OptionSelectField } from "../components/FormFields";
import { OnboardingFormScreen } from "../components/Onboarding";

const emptyMedication: TMedicationFormValues["medications"][number] = {
  dmplusdCode: "",
  dose: "",
  endAt: null,
  form: "",
  frequency: "",
  instructions: "",
  name: "",
  route: "",
  snomedCode: "",
  startAt: null,
  status: "active",
  strength: "",
};

const MEDICATION_STATUS_OPTIONS = [
  { label: "Yes", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Stopped", value: "stopped" },
  { label: "Completed", value: "completed" },
] as const;

export default function MedicationsForm({
  defaults,
}: {
  defaults?: Partial<TMedicationFormValues>;
}) {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TMedicationFormValues>({
    defaultValues: {
      medications: defaults?.medications?.length
        ? defaults.medications
        : [emptyMedication],
    },
    resolver: zodResolver(
      MedicationsFormSchema,
    ) as Resolver<TMedicationFormValues>,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "medications",
  });

  async function onSubmit(values: TMedicationFormValues) {
    router.push("/(auth)/onboarding/labs-form");
  }

  return (
    <OnboardingFormScreen contentContainerStyle={{ gap: 24 }}>
      {fields.map((field, index) => {
        const base = `medications.${index}` as const;
        const medErrors =
          (errors.medications && errors.medications[index]) || undefined;

        return (
          <View
            key={field.id}
            style={{ borderRadius: 12, borderWidth: 1, gap: 12, padding: 16 }}
          >
            <Text style={{ fontWeight: "700" }}>Medication {index + 1}</Text>

            <Controller
              control={control}
              name={`${base}.name`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Sevelamer 800 mg tablet"
                  error={medErrors?.name?.message as string | undefined}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.strength`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Strength"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="800 mg"
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.frequency`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Frequency/Per day"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Three times daily"
                  error={medErrors?.frequency?.message as string | undefined}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.form`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Form"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="Tablet, solution..."
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.dose`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Dose"
                  value={value}
                  onChangeText={onChange}
                  placeholder="800 mg"
                  error={medErrors?.dose?.message as string | undefined}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.route`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="How are you taking this?"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="Oral, IV..."
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.instructions`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="Instructions"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="Take with meals"
                  multiline
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.dmplusdCode`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="dm+d code (optional)"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="1234567"
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.snomedCode`}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label="SNOMED code (optional)"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder="987654321"
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.status`}
              render={({ field: { value, onChange } }) => (
                <OptionSelectField
                  label="Are you taking this now?"
                  value={value}
                  options={[...MEDICATION_STATUS_OPTIONS]}
                  onChange={onChange}
                />
              )}
            />
            <Controller
              control={control}
              name={`${base}.startAt`}
              render={({ field: { value, onChange } }) => (
                <DateField
                  label="Start date"
                  value={value ? value.toISOString() : null}
                  onChange={(nextValue) =>
                    onChange(nextValue ? new Date(nextValue) : null)
                  }
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.endAt`}
              render={({ field: { value, onChange } }) => (
                <DateField
                  label="End date"
                  value={value ? value.toISOString() : null}
                  onChange={(nextValue) =>
                    onChange(nextValue ? new Date(nextValue) : null)
                  }
                />
              )}
            />

            {fields.length > 1 && (
              <AppButton
                label="Remove medication"
                variant="danger"
                onPress={() => remove(index)}
              />
            )}
          </View>
        );
      })}

      <AppButton
        label="Add medication"
        variant="outline"
        onPress={() => append({ ...emptyMedication })}
      />

      {typeof errors.medications?.message === "string" && (
        <Text style={{ color: "red" }}>{errors.medications.message}</Text>
      )}

      <PrimaryButton
        label={isSubmitting ? "Saving..." : "Save medications"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </OnboardingFormScreen>
  );
}
