import React from "react";
import { Alert, Button, ScrollView, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  Controller,
  type Control,
  useFieldArray,
  useForm,
  type Resolver,
} from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import {
  ACR,
  CKDStage,
  ClinicalFormSchema,
  DialysisStatus,
  TClinicalFormValues,
  type TUserClinicalUpdate,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { DateField, LabeledInput } from "./FormFields";

const emptyDiagnosis = { label: "", code: "" };
const emptyCareTeamMember = { role: "", name: "", org: "", contact: "" };

const defaultTargets: TClinicalFormValues["targets"] = {
  caloriesKcal: "",
  proteinG: "",
  phosphorusMg: "",
  potassiumMg: "",
  sodiumMg: "",
  fluidMl: "",
};

export default function ClinicalForm({
  defaults,
}: {
  defaults?: Partial<TClinicalFormValues>;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TClinicalFormValues>({
    resolver: zodResolver(
      ClinicalFormSchema
    ) as unknown as Resolver<TClinicalFormValues>,
    defaultValues: {
      ckdStage: defaults?.ckdStage ?? "",
      egfrCurrent: defaults?.egfrCurrent ?? "",
      acrCategory: defaults?.acrCategory ?? "",
      dialysisStatus: defaults?.dialysisStatus ?? "none",
      diagnoses: defaults?.diagnoses ?? [],
      allergies: defaults?.allergies ?? [],
      dietaryPreferences: defaults?.dietaryPreferences ?? [],
      contraindications: defaults?.contraindications ?? [],
      targets: defaults?.targets ?? { ...defaultTargets },
      careTeam: defaults?.careTeam ?? [],
      lastClinicalUpdateAt: defaults?.lastClinicalUpdateAt ?? null,
    },
  });

  const diagnosesArray = useFieldArray({ control, name: "diagnoses" });
  const allergiesArray = useFieldArray({ control, name: "allergies" });
  const dietArray = useFieldArray({ control, name: "dietaryPreferences" });
  const contraindicationsArray = useFieldArray({
    control,
    name: "contraindications",
  });
  const careTeamArray = useFieldArray({ control, name: "careTeam" });

  async function onSubmit(values: TClinicalFormValues) {
    const payload: Partial<TUserClinicalUpdate> = {
      ckdStage: values.ckdStage
        ? (values.ckdStage as TUserClinicalUpdate["ckdStage"])
        : null,
      egfrCurrent: values.egfrCurrent?.trim()
        ? Number(values.egfrCurrent)
        : undefined,
      acrCategory: values.acrCategory
        ? (values.acrCategory as TUserClinicalUpdate["acrCategory"])
        : null,
      dialysisStatus: values.dialysisStatus,
      diagnoses: values.diagnoses
        .filter((dx) => dx.label.trim().length)
        .map((dx) => ({
          label: dx.label.trim(),
          ...(dx.code?.trim() ? { code: dx.code.trim() } : {}),
        })),
      allergies: values.allergies
        .map((item) => item.value.trim())
        .filter(Boolean),
      dietaryPreferences: values.dietaryPreferences
        .map((item) => item.value.trim())
        .filter(Boolean),
      contraindications: values.contraindications
        .map((item) => item.value.trim())
        .filter(Boolean),
      targets: buildTargets(values.targets),
      careTeam: values.careTeam
        .filter((member) => member.role.trim().length)
        .map((member) => ({
          role: member.role.trim(),
          ...(member.name?.trim() ? { name: member.name.trim() } : {}),
          ...(member.org?.trim() ? { org: member.org.trim() } : {}),
          ...(member.contact?.trim() ? { contact: member.contact.trim() } : {}),
        })),
      lastClinicalUpdateAt: (() => {
        const v = values.lastClinicalUpdateAt;
        if (v == null || v === "") return undefined;
        return typeof v === "string" ? new Date(v) : v;
      })(),
    };

    try {
      const res = await authFetch(`${API}/api/users/clinical/create`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`${res.status} ${JSON.stringify(err)}`);
      }
      Alert.alert("Clinical profile saved");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to save clinical data");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: "700" }}>Kidney status</Text>

        <Controller
          control={control}
          name="ckdStage"
          render={({ field: { value, onChange } }) => (
            <View>
              <Text>CKD stage</Text>
              <Picker selectedValue={value} onValueChange={onChange}>
                <Picker.Item label="Select" value="" />
                {CKDStage.options.map((option) => (
                  <Picker.Item
                    key={option}
                    label={`Stage ${option.toUpperCase()}`}
                    value={option}
                  />
                ))}
              </Picker>
            </View>
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
            <View>
              <Text>ACR category</Text>
              <Picker selectedValue={value} onValueChange={onChange}>
                <Picker.Item label="Select" value="" />
                {ACR.options.map((option) => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </View>
          )}
        />

        <Controller
          control={control}
          name="dialysisStatus"
          render={({ field: { value, onChange } }) => (
            <View>
              <Text>Dialysis status</Text>
              <Picker selectedValue={value} onValueChange={onChange}>
                {DialysisStatus.options.map((option) => (
                  <Picker.Item
                    key={option}
                    label={option.replace("-", " ")}
                    value={option}
                  />
                ))}
              </Picker>
            </View>
          )}
        />
      </View>

      <Section
        title="Diagnoses"
        emptyLabel="No diagnoses added"
        addLabel="Add diagnosis"
        onAdd={() => diagnosesArray.append({ ...emptyDiagnosis })}
      >
        {diagnosesArray.fields.map((field, index) => {
          const dxErrors = errors.diagnoses?.[index];
          const base = `diagnoses.${index}` as const;
          return (
            <View
              key={field.id}
              style={{ borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}
            >
              <Controller
                control={control}
                name={`${base}.label`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Label"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Hypertension"
                    error={dxErrors?.label?.message as string | undefined}
                  />
                )}
              />
              <Controller
                control={control}
                name={`${base}.code`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Code (optional)"
                    value={value ?? ""}
                    onChangeText={onChange}
                    placeholder="I10"
                  />
                )}
              />
              <Button
                color="#b91c1c"
                title="Remove diagnosis"
                onPress={() => diagnosesArray.remove(index)}
              />
            </View>
          );
        })}
      </Section>

      <StringArraySection
        title="Allergies"
        itemLabel="Allergy"
        errors={errors.allergies}
        fields={allergiesArray.fields}
        control={control}
        fieldName="allergies"
        onAdd={() => allergiesArray.append({ value: "" })}
        onRemove={allergiesArray.remove}
        placeholder="Penicillin"
      />

      <StringArraySection
        title="Dietary preferences"
        itemLabel="Preference"
        errors={errors.dietaryPreferences}
        fields={dietArray.fields}
        control={control}
        fieldName="dietaryPreferences"
        onAdd={() => dietArray.append({ value: "" })}
        onRemove={dietArray.remove}
        placeholder="Vegetarian"
      />

      <StringArraySection
        title="Contraindications"
        itemLabel="Contraindication"
        errors={errors.contraindications}
        fields={contraindicationsArray.fields}
        control={control}
        fieldName="contraindications"
        onAdd={() => contraindicationsArray.append({ value: "" })}
        onRemove={contraindicationsArray.remove}
        placeholder="NSAIDs"
      />

      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: "700" }}>Nutritional targets</Text>
        {(
          [
            ["caloriesKcal", "Calories (kcal)"],
            ["proteinG", "Protein (g)"],
            ["phosphorusMg", "Phosphorus (mg)"],
            ["potassiumMg", "Potassium (mg)"],
            ["sodiumMg", "Sodium (mg)"],
            ["fluidMl", "Fluid (mL)"],
          ] as const
        ).map(([field, label]) => (
          <Controller
            key={field}
            control={control}
            name={`targets.${field}` as const}
            render={({ field: { value, onChange } }) => (
              <LabeledInput
                label={label}
                value={value ?? ""}
                onChangeText={onChange}
                keyboardType="numeric"
                error={
                  (errors.targets?.[field]?.message as string | undefined) ||
                  undefined
                }
              />
            )}
          />
        ))}
      </View>

      <Section
        title="Care team"
        emptyLabel="No care team members"
        addLabel="Add care team member"
        onAdd={() => careTeamArray.append({ ...emptyCareTeamMember })}
      >
        {careTeamArray.fields.map((field, index) => {
          const ctErrors = errors.careTeam?.[index];
          const base = `careTeam.${index}` as const;
          return (
            <View
              key={field.id}
              style={{ borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}
            >
              <Controller
                control={control}
                name={`${base}.role`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Role"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Nephrologist"
                    error={ctErrors?.role?.message as string | undefined}
                  />
                )}
              />
              <Controller
                control={control}
                name={`${base}.name`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Name"
                    value={value ?? ""}
                    onChangeText={onChange}
                    placeholder="Dr. Smith"
                  />
                )}
              />
              <Controller
                control={control}
                name={`${base}.org`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Organisation"
                    value={value ?? ""}
                    onChangeText={onChange}
                    placeholder="Renal Clinic"
                  />
                )}
              />
              <Controller
                control={control}
                name={`${base}.contact`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Contact info"
                    value={value ?? ""}
                    onChangeText={onChange}
                    placeholder="email or phone"
                  />
                )}
              />
              <Button
                color="#b91c1c"
                title="Remove member"
                onPress={() => careTeamArray.remove(index)}
              />
            </View>
          );
        })}
      </Section>

      <Controller
        control={control}
        name="lastClinicalUpdateAt"
        render={({ field: { value, onChange } }) => (
          <DateField
            label="Last clinical update"
            value={value}
            onChange={onChange}
          />
        )}
      />

      <Button
        title={isSubmitting ? "Saving..." : "Save clinical profile"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </ScrollView>
  );
}

function buildTargets(
  targets: TClinicalFormValues["targets"]
): TUserClinicalUpdate["targets"] | undefined {
  const entries = Object.entries(targets).map(([key, value]) => [
    key,
    value?.trim() ? Number(value) : undefined,
  ]);

  const hasValue = entries.some(([, value]) => typeof value === "number");
  if (!hasValue) return undefined;

  return Object.fromEntries(
    entries.filter(([, value]) => typeof value === "number")
  ) as TUserClinicalUpdate["targets"];
}

function Section({
  title,
  emptyLabel,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  emptyLabel: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: "700" }}>{title}</Text>
      {React.Children.count(children) === 0 ? (
        <Text style={{ color: "#555" }}>{emptyLabel}</Text>
      ) : (
        children
      )}
      <Button title={addLabel} onPress={onAdd} />
    </View>
  );
}

function StringArraySection({
  title,
  itemLabel,
  fields,
  control,
  fieldName,
  placeholder,
  onAdd,
  onRemove,
  errors,
}: {
  title: string;
  itemLabel: string;
  fields: { id: string; value?: string }[];
  control: Control<TClinicalFormValues>;
  fieldName: "allergies" | "dietaryPreferences" | "contraindications";
  placeholder: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  errors?: any;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: "700" }}>{title}</Text>
      {fields.length === 0 && (
        <Text style={{ color: "#555" }}>No items added</Text>
      )}
      {fields.map((field, index) => (
        <View
          key={field.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name={`${fieldName}.${index}.value` as const}
              render={({ field: { value, onChange } }) => (
                <LabeledInput
                  label={`${itemLabel} ${index + 1}`}
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder={placeholder}
                  error={errors?.[index]?.value?.message as string | undefined}
                />
              )}
            />
          </View>
          <Button
            title="Remove"
            color="#b91c1c"
            onPress={() => onRemove(index)}
          />
        </View>
      ))}
      <Button title={`Add ${itemLabel.toLowerCase()}`} onPress={onAdd} />
    </View>
  );
}
