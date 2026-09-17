import React from "react";
import { Text, View } from "react-native";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { TLabsFormValues, LabsSchema } from "@ckd/core";
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
  EMPTY_LAB,
  LAB_ABNORMAL_FLAG_OPTIONS,
  LAB_SOURCE_OPTIONS,
  LAB_STATUS_OPTIONS,
} from "../definitions/labs";
import { styles } from "../styles";

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
      labs: defaults?.labs?.length ? defaults.labs : [EMPTY_LAB],
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
        return (
          <RepeatableFormCard
            key={field.id}
            title={`Lab result ${index + 1}`}
            removeLabel="Remove lab"
            onRemove={fields.length > 1 ? () => remove(index) : undefined}
          >

            <ControlledTextField
              control={control}
              label="Test code"
              name={`${base}.code`}
              placeholder="33914-3"
            />

            <ControlledTextField
              control={control}
              label="Name"
              name={`${base}.name`}
              placeholder="eGFR"
            />

            <ControlledTextField
              control={control}
              label="Value"
              name={`${base}.value`}
              placeholder="42"
            />

            <ControlledTextField
              control={control}
              label="Unit"
              name={`${base}.unit`}
              placeholder="mL/min/1.73m²"
            />

            <View style={styles.splitRow}>
              <View style={styles.flexItem}>
                <ControlledTextField
                  control={control}
                  label="Ref range (low)"
                  name={`${base}.refRangeLow`}
                  placeholder="60"
                />
              </View>
              <View style={styles.flexItem}>
                <ControlledTextField
                  control={control}
                  label="Ref range (high)"
                  name={`${base}.refRangeHigh`}
                  placeholder="90"
                />
              </View>
            </View>

            <ControlledTextField
              control={control}
              label="Ref range (text)"
              name={`${base}.refRangeText`}
              placeholder=">= 60"
            />

            <ControlledOptionField
              control={control}
              label="Source"
              name={`${base}.source`}
              options={[...LAB_SOURCE_OPTIONS]}
            />

            <ControlledOptionField
              control={control}
              label="Status"
              name={`${base}.status`}
              options={[...LAB_STATUS_OPTIONS]}
            />

            <ControlledOptionField
              control={control}
              label="Abnormal flag"
              name={`${base}.sourceAbnormalFlag`}
              options={[...LAB_ABNORMAL_FLAG_OPTIONS]}
              toFormValue={(nextValue) =>
                nextValue === "" ? null : nextValue
              }
            />

            <ControlledTextField
              control={control}
              label="Note"
              name={`${base}.note`}
              placeholder="Operational note"
              multiline
            />

            <ControlledDateField
              control={control}
              label="Sample collected"
              name={`${base}.takenAt`}
              toFormValue={(nextValue) =>
                nextValue ? new Date(nextValue) : null
              }
            />

            <ControlledDateField
              control={control}
              label="Result reported"
              name={`${base}.reportedAt`}
              toFormValue={(nextValue) =>
                nextValue ? new Date(nextValue) : null
              }
            />

          </RepeatableFormCard>
        );
      })}

      <AppButton
        label="Add lab"
        variant="outline"
        onPress={() => append({ ...EMPTY_LAB })}
      />

      {typeof errors.labs?.message === "string" && (
        <Text style={styles.errorText}>{errors.labs.message}</Text>
      )}

      <AppButton variant="primary"
        label={isSubmitting ? "Saving..." : "Save labs"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </OnboardingFormScreen>
  );
}
