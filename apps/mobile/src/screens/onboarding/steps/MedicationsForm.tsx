import React from "react";
import { Alert, Button, ScrollView, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  Controller,
  useFieldArray,
  useForm,
  type Resolver,
} from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { MedicationsFormSchema, TMedicationFormValues } from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { DateField, LabeledInput } from "./FormFields";
import { useRouter } from "expo-router";

const emptyMedication: TMedicationFormValues["medications"][number] = {
  name: "",
  form: "",
  strength: "",
  route: "",
  dose: "",
  frequency: "",
  instructions: "",
  startAt: null,
  endAt: null,
  status: "active",
  dmplusdCode: "",
  snomedCode: "",
};

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
    resolver: zodResolver(
      MedicationsFormSchema
    ) as Resolver<TMedicationFormValues>,
    defaultValues: {
      medications: defaults?.medications?.length
        ? defaults.medications
        : [emptyMedication],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "medications",
  });

  async function onSubmit(values: TMedicationFormValues) {
    // const payload = values.medications.map((med) => ({
    //   name: med.name.trim(),
    //   form: med.form?.trim() || undefined,
    //   strength: med.strength?.trim() || undefined,
    //   route: med.route?.trim() || undefined,
    //   dose: med.dose.trim(),
    //   frequency: med.frequency.trim(),
    //   instructions: med.instructions?.trim() || undefined,
    //   startAt: med.startAt ?? undefined,
    //   endAt: med.endAt ?? undefined,
    //   status: med.status,
    //   dmplusdCode: med.dmplusdCode?.trim() || undefined,
    //   snomedCode: med.snomedCode?.trim() || undefined,
    // }));
    console.log("what????");

    router.push("/(auth)/onboarding/labs-form");
    // try {
    //   const res = await authFetch(`${API}/api/users/medications/create`, {
    //     method: "POST",
    //     body: JSON.stringify({ medications: payload }),
    //   });
    //   if (!res.ok) {
    //     const err = await res.json().catch(() => ({}));
    //     throw new Error(`${res.status} ${JSON.stringify(err)}`);
    //   }
    //   Alert.alert("Medications saved");
    // } catch (err: any) {
    //   Alert.alert("Error", err?.message ?? "Failed to save medications");
    // }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      {fields.map((field, index) => {
        const base = `medications.${index}` as const;
        const medErrors =
          (errors.medications && errors.medications[index]) || undefined;

        return (
          <View
            key={field.id}
            style={{ borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 }}
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
                <View>
                  <Text>Are you taking this now?</Text>
                  <Picker selectedValue={value} onValueChange={onChange}>
                    <Picker.Item label="Yes" value="active" />
                    <Picker.Item label="Paused" value="paused" />
                    <Picker.Item label="Stopped" value="stopped" />
                    <Picker.Item label="Completed" value="completed" />
                  </Picker>
                </View>
              )}
            />
            <Controller
              control={control}
              name={`${base}.startAt`}
              render={({ field: { value, onChange } }) => (
                <DateField
                  label="Start date"
                  value={value as any}
                  onChange={onChange}
                />
              )}
            />

            <Controller
              control={control}
              name={`${base}.endAt`}
              render={({ field: { value, onChange } }) => (
                <DateField
                  label="End date"
                  value={value as any}
                  onChange={onChange}
                />
              )}
            />

            {fields.length > 1 && (
              <Button
                color="#b91c1c"
                title="Remove medication"
                onPress={() => remove(index)}
              />
            )}
          </View>
        );
      })}

      <Button
        title="Add medication"
        onPress={() => append({ ...emptyMedication })}
      />

      {typeof errors.medications?.message === "string" && (
        <Text style={{ color: "red" }}>{errors.medications.message}</Text>
      )}

      <Button
        title={isSubmitting ? "Saving..." : "Save medications"}
        // disabled={isSubmitting}
        // onPress={handleSubmit(onSubmit)}
        onPress={() => {
          console.log("button pressed directly");
          router.push("/(auth)/onboarding/labs-form");
        }}
      />
    </ScrollView>
  );
}
