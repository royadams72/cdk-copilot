import React from "react";
import { Text } from "react-native";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { MedicationsFormSchema, TMedicationFormValues } from "@ckd/core";
import { useRouter } from "expo-router";
import { AppButton } from "@/components/ui/button";
import { OnboardingFormScreen } from "../components/Onboarding";
import { RepeatableFormCard } from "../components/RepeatableFormCard";
import {
  ControlledDateField,
  ControlledOptionField,
  ControlledTextField,
} from "../components/ControlledFormFields";
import {
  EMPTY_MEDICATION,
  MEDICATION_STATUS_OPTIONS,
} from "../definitions/medications";
import { styles } from "../styles";

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
        : [EMPTY_MEDICATION],
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
        return (
          <RepeatableFormCard
            key={field.id}
            title={`Medication ${index + 1}`}
            removeLabel="Remove medication"
            onRemove={fields.length > 1 ? () => remove(index) : undefined}
          >

            <ControlledTextField
              control={control}
              label="Name"
              name={`${base}.name`}
              placeholder="Sevelamer 800 mg tablet"
            />

            <ControlledTextField
              control={control}
              label="Strength"
              name={`${base}.strength`}
              placeholder="800 mg"
            />

            <ControlledTextField
              control={control}
              label="Frequency/Per day"
              name={`${base}.frequency`}
              placeholder="Three times daily"
            />

            <ControlledTextField
              control={control}
              label="Form"
              name={`${base}.form`}
              placeholder="Tablet, solution..."
            />

            <ControlledTextField
              control={control}
              label="Dose"
              name={`${base}.dose`}
              placeholder="800 mg"
            />

            <ControlledTextField
              control={control}
              label="How are you taking this?"
              name={`${base}.route`}
              placeholder="Oral, IV..."
            />

            <ControlledTextField
              control={control}
              label="Instructions"
              name={`${base}.instructions`}
              placeholder="Take with meals"
              multiline
            />

            <ControlledTextField
              control={control}
              label="dm+d code (optional)"
              name={`${base}.dmplusdCode`}
              placeholder="1234567"
            />

            <ControlledTextField
              control={control}
              label="SNOMED code (optional)"
              name={`${base}.snomedCode`}
              placeholder="987654321"
            />

            <ControlledOptionField
              control={control}
              label="Are you taking this now?"
              name={`${base}.status`}
              options={[...MEDICATION_STATUS_OPTIONS]}
            />
            <ControlledDateField
              control={control}
              label="Start date"
              name={`${base}.startAt`}
              toFormValue={(nextValue) =>
                nextValue ? new Date(nextValue) : null
              }
            />

            <ControlledDateField
              control={control}
              label="End date"
              name={`${base}.endAt`}
              toFormValue={(nextValue) =>
                nextValue ? new Date(nextValue) : null
              }
            />

          </RepeatableFormCard>
        );
      })}

      <AppButton
        label="Add medication"
        variant="outline"
        onPress={() => append({ ...EMPTY_MEDICATION })}
      />

      {typeof errors.medications?.message === "string" && (
        <Text style={styles.errorText}>{errors.medications.message}</Text>
      )}

      <AppButton variant="primary"
        label={isSubmitting ? "Saving..." : "Save medications"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </OnboardingFormScreen>
  );
}
