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
import { TLabsFormValues, LabsSchema } from "@ckd/core";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { DateField, LabeledInput } from "./FormFields";
import { useRouter } from "expo-router";

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
  abnormalFlag: "",
  note: "",
};

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
        abnormalFlag: lab.abnormalFlag ? lab.abnormalFlag : undefined,
        note: lab.note?.trim() || undefined,
      };
    });
    router.push("./onboarding/steps/clinical-form");
    // try {
    //   const res = await authFetch(`${API}/api/users/labs/create`, {
    //     method: "POST",
    //     body: JSON.stringify({ labs: payload }),
    //   });
    //   if (!res.ok) {
    //     const err = await res.json().catch(() => ({}));
    //     throw new Error(`${res.status} ${JSON.stringify(err)}`);
    //   }
    //   Alert.alert("Labs saved");
    // } catch (err: any) {
    //   Alert.alert("Error", err?.message ?? "Failed to save labs");
    // }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
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
                <View>
                  <Text>Source</Text>
                  <Picker selectedValue={value} onValueChange={onChange}>
                    <Picker.Item label="Manual" value="manual" />
                    <Picker.Item label="Import" value="import" />
                    <Picker.Item label="Integration" value="integration" />
                  </Picker>
                </View>
              )}
            />

            <Controller
              control={control}
              name={`${base}.status`}
              render={({ field: { value, onChange } }) => (
                <View>
                  <Text>Status</Text>
                  <Picker selectedValue={value} onValueChange={onChange}>
                    <Picker.Item label="Final" value="final" />
                    <Picker.Item label="Corrected" value="corrected" />
                    <Picker.Item label="Preliminary" value="preliminary" />
                    <Picker.Item label="Cancelled" value="cancelled" />
                  </Picker>
                </View>
              )}
            />

            <Controller
              control={control}
              name={`${base}.abnormalFlag`}
              render={({ field: { value, onChange } }) => (
                <View>
                  <Text>Abnormal flag</Text>
                  <Picker selectedValue={value ?? ""} onValueChange={onChange}>
                    <Picker.Item label="None" value="" />
                    <Picker.Item label="Low (L)" value="L" />
                    <Picker.Item label="Critical low (LL)" value="LL" />
                    <Picker.Item label="High (H)" value="H" />
                    <Picker.Item label="Critical high (HH)" value="HH" />
                    <Picker.Item label="Abnormal (A)" value="A" />
                    <Picker.Item label="Normal (N)" value="N" />
                  </Picker>
                </View>
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
                  onChange={(v) => onChange(v ? new Date(v) : null)}
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
                  onChange={(v) => onChange(v ? new Date(v) : null)}
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

      <Button
        title={isSubmitting ? "Saving..." : "Save labs"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </ScrollView>
  );
}
