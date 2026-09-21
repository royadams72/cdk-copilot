import { Text, View } from "react-native";
import {
  type Control,
  Controller,
  type FieldErrors,
  type Path,
} from "react-hook-form";

import { ACR, CKD_STAGE_VALUES, DialysisStatus } from "@ckd/core";

import { LabeledInput, OptionSelectField } from "../FormFields";
import { styles } from "../../styles";
import type { TClinicalOnboardingFormValues } from "../../types";

type BasicsSectionProps = {
  control: Control<TClinicalOnboardingFormValues>;
  errors: FieldErrors<TClinicalOnboardingFormValues>;
  persistIfValid: (
    fieldName: Path<TClinicalOnboardingFormValues>,
  ) => Promise<void>;
};

export function KidneyStatusSection({
  control,
  errors,
  persistIfValid,
}: BasicsSectionProps) {
  return (
    <View style={styles.formSection}>
      <Text style={styles.sectionTitle}>Kidney status</Text>

      <Controller
        control={control}
        name="ckdStage"
        render={({ field: { value, onChange } }) => (
          <OptionSelectField
            label="CKD stage"
            value={value}
            options={CKD_STAGE_VALUES.map((option) => ({
              label: `Stage ${option.toUpperCase()}`,
              value: option,
            }))}
            onChange={(nextValue) => {
              onChange(nextValue);
              void persistIfValid("ckdStage");
            }}
            error={errors.ckdStage?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="egfrCurrent"
        render={({ field: { value, onChange } }) => (
          <LabeledInput
            label="eGFR (mL/min/1.73m²)"
            value={value ?? ""}
            onChangeText={onChange}
            onBlur={() => void persistIfValid("egfrCurrent")}
            keyboardType="numeric"
            placeholder="42"
            error={errors.egfrCurrent?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="acrCategory"
        render={({ field: { value, onChange } }) => (
          <OptionSelectField
            label="ACR category"
            value={value}
            options={ACR.options.map((option) => ({
              label: option,
              value: option,
            }))}
            onChange={(nextValue) => {
              onChange(nextValue);
              void persistIfValid("acrCategory");
            }}
            error={errors.acrCategory?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="dialysisStatus"
        render={({ field: { value, onChange } }) => (
          <OptionSelectField
            label="Dialysis status"
            value={value}
            options={DialysisStatus.options.map((option) => ({
              label: option.replace("-", " "),
              value: option,
            }))}
            onChange={(nextValue) => {
              onChange(nextValue);
              void persistIfValid("dialysisStatus");
            }}
            error={errors.dialysisStatus?.message}
          />
        )}
      />
    </View>
  );
}

export function BodyMeasurementsSection({
  control,
  errors,
  persistIfValid,
}: BasicsSectionProps) {
  return (
    <View style={styles.formSection}>
      <Text style={styles.sectionTitle}>Body measurements</Text>

      <Controller
        control={control}
        name="weightKg"
        render={({ field: { value, onChange } }) => (
          <LabeledInput
            label="Weight (kg)"
            value={value ?? ""}
            onChangeText={onChange}
            onBlur={() => void persistIfValid("weightKg")}
            keyboardType="numeric"
            error={errors.weightKg?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="heightCm"
        render={({ field: { value, onChange } }) => (
          <LabeledInput
            label="Height (cm)"
            value={value ?? ""}
            onChangeText={onChange}
            onBlur={() => void persistIfValid("heightCm")}
            keyboardType="numeric"
            error={errors.heightCm?.message}
          />
        )}
      />
    </View>
  );
}
