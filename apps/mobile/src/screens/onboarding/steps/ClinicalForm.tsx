import React, { useEffect } from "react";
import { Alert, Button, Text, View } from "react-native";
import {
  type Control,
  Controller,
  type Path,
  type Resolver,
  useFieldArray,
  useForm,
} from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import {
  ACR,
  CKD_STAGE_VALUES,
  ClinicalFormSchema,
  DialysisStatus,
  TClinicalFormValues,
  type TUserClinicalUpdate,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import {
  LabeledInput,
  OptionSelectField,
} from "@/screens/onboarding/components/FormFields";
import { useRouter } from "expo-router";
import { onboardingDrafts } from "@/lib/onboarding";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";
import { PrimaryButton } from "@/screens/onboarding/components/Buttons";

const emptyDiagnosis = { code: "", label: "" };

export default function ClinicalForm({
  defaults,
}: {
  defaults?: Partial<TClinicalFormValues>;
}) {
  const router = useRouter();
  const {
    control,
    getValues,
    handleSubmit,
    reset,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<TClinicalFormValues>({
    defaultValues: {
      ckdStage: defaults?.ckdStage ?? undefined,
      egfrCurrent: defaults?.egfrCurrent ?? "",
      acrCategory: defaults?.acrCategory ?? "",
      dialysisStatus: defaults?.dialysisStatus ?? "none",
      weightKg: defaults?.weightKg ?? "",
      heightCm: defaults?.heightCm ?? "",
      diagnoses: defaults?.diagnoses ?? [],
      allergies: defaults?.allergies ?? [],
      dietaryPreferences: defaults?.dietaryPreferences ?? [],
      careTeam: defaults?.careTeam ?? [],
    },
    resolver: zodResolver(
      ClinicalFormSchema,
    ) as unknown as Resolver<TClinicalFormValues>,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      const draft =
        await onboardingDrafts.loadClinicalDraft<TClinicalFormValues>();
      if (active && draft) {
        reset({ ...getValues(), ...draft });
      }
    })();

    return () => {
      active = false;
    };
  }, [getValues, reset]);

  const diagnosesArray = useFieldArray({ control, name: "diagnoses" });
  const allergiesArray = useFieldArray({ control, name: "allergies" });
  const dietArray = useFieldArray({ control, name: "dietaryPreferences" });

  async function persistIfValid(fieldName: Path<TClinicalFormValues>) {
    const valid = await trigger(fieldName);
    if (!valid) return;
    await onboardingDrafts.saveClinicalDraft<TClinicalFormValues>(getValues());
  }

  async function persistDraftSnapshot() {
    await onboardingDrafts.saveClinicalDraft<TClinicalFormValues>(getValues());
  }

  async function onSubmit(values: TClinicalFormValues) {
    const payload: Partial<TUserClinicalUpdate> = {
      acrCategory: values.acrCategory
        ? (values.acrCategory as TUserClinicalUpdate["acrCategory"])
        : null,
      allergies: values.allergies
        .map((item) => item.value.trim())
        .filter(Boolean),
      careTeam: values.careTeam
        .filter((member) => member.role.trim().length)
        .map((member) => ({
          role: member.role.trim(),
          ...(member.name?.trim() ? { name: member.name.trim() } : {}),
          ...(member.org?.trim() ? { org: member.org.trim() } : {}),
          ...(member.contact?.trim() ? { contact: member.contact.trim() } : {}),
        })),
      ckdStage: values.ckdStage as TUserClinicalUpdate["ckdStage"],
      diagnoses: values.diagnoses
        .filter((dx) => dx.label.trim().length)
        .map((dx) => ({
          label: dx.label.trim(),
          ...(dx.code?.trim() ? { code: dx.code.trim() } : {}),
        })),
      dialysisStatus: values.dialysisStatus,
      dietaryPreferences: values.dietaryPreferences
        .map((item) => item.value.trim())
        .filter(Boolean),
      egfrCurrent: Number(values.egfrCurrent),
      heightCm: Number(values.heightCm),
      weightKg: Number(values.weightKg),
    };

    try {
      const res = await authFetch(`${API}/api/users/clinical/create`, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(formatApiError(res.status, errBody));
      }
      await onboardingDrafts.clearPiiDraft();
      await onboardingDrafts.clearClinicalDraft();
      router.replace("/(dashboard)/dashboard");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to save clinical data");
    }
  }

  return (
    <OnboardingFormScreen contentContainerStyle={{ gap: 24 }}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: "700" }}>Kidney status</Text>

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
              onBlur={() => {
                void persistIfValid("egfrCurrent");
              }}
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
      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: "700" }}>Body measurements</Text>

        <Controller
          control={control}
          name="weightKg"
          render={({ field: { value, onChange } }) => (
            <LabeledInput
              label="Weight (kg)"
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={() => {
                void persistIfValid("weightKg");
              }}
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
              onBlur={() => {
                void persistIfValid("heightCm");
              }}
              keyboardType="numeric"
              error={errors.heightCm?.message}
            />
          )}
        />
      </View>
      <Section
        title="Other conditions"
        emptyLabel="No conditions added"
        addLabel="Add condition"
        onAdd={() => {
          diagnosesArray.append({ ...emptyDiagnosis });
          void persistDraftSnapshot();
        }}
      >
        {diagnosesArray.fields.map((field, index) => {
          const dxErrors = errors.diagnoses?.[index];
          const base = `diagnoses.${index}` as const;
          return (
            <View
              key={field.id}
              style={{ borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 }}
            >
              <Controller
                control={control}
                name={`${base}.label`}
                render={({ field: { value, onChange } }) => (
                  <LabeledInput
                    label="Label"
                    value={value}
                    onChangeText={onChange}
                    onBlur={() => {
                      void persistIfValid(`${base}.label`);
                    }}
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
                    onBlur={() => {
                      void persistIfValid(`${base}.code`);
                    }}
                    placeholder="I10"
                  />
                )}
              />
              <Button
                color="#b91c1c"
                title="Remove condition"
                onPress={() => {
                  diagnosesArray.remove(index);
                  void persistDraftSnapshot();
                }}
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
        onAdd={() => {
          allergiesArray.append({ value: "" });
          void persistDraftSnapshot();
        }}
        onRemove={(index) => {
          allergiesArray.remove(index);
          void persistDraftSnapshot();
        }}
        placeholder="Penicillin"
        onPersistField={persistIfValid}
      />

      <StringArraySection
        title="Dietary preferences"
        itemLabel="Preference"
        errors={errors.dietaryPreferences}
        fields={dietArray.fields}
        control={control}
        fieldName="dietaryPreferences"
        onAdd={() => {
          dietArray.append({ value: "" });
          void persistDraftSnapshot();
        }}
        onRemove={(index) => {
          dietArray.remove(index);
          void persistDraftSnapshot();
        }}
        placeholder="Vegetarian"
        onPersistField={persistIfValid}
      />

      <PrimaryButton
        label={isSubmitting ? "Saving..." : "Save Profile"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </OnboardingFormScreen>
  );
}

function Section({
  title,
  emptyLabel,
  addLabel,
  onAdd,
  children,
}: {
  addLabel: string;
  children: React.ReactNode;
  emptyLabel: string;
  onAdd: () => void;
  title: string;
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
  onPersistField,
}: {
  control: Control<TClinicalFormValues>;
  errors?: any;
  fieldName: "allergies" | "dietaryPreferences";
  fields: { id: string; value?: string }[];
  itemLabel: string;
  onAdd: () => void;
  onPersistField: (fieldName: Path<TClinicalFormValues>) => Promise<void>;
  onRemove: (index: number) => void;
  placeholder: string;
  title: string;
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
          style={{ alignItems: "center", flexDirection: "row", gap: 8 }}
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
                  onBlur={() => {
                    void onPersistField(`${fieldName}.${index}.value`);
                  }}
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
