import React, { useEffect } from "react";
import { Alert } from "react-native";
import {
  type Path,
  type Resolver,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import {
  type TAllergyFormItem,
  type TConditionFormItem,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import { onboardingDrafts } from "@/lib/onboarding";
import { PrimaryButton } from "@/screens/onboarding/components/Buttons";
import {
  AllergiesSection,
  BodyMeasurementsSection,
  ConditionsSection,
  DietaryPreferencesSection,
  KidneyStatusSection,
} from "@/screens/onboarding/components/ClinicalFormSections";
import { OnboardingFormScreen } from "@/screens/onboarding/components/Onboarding";
import type {
  DietaryPreferenceInput,
  TClinicalOnboardingFormValues,
} from "@/screens/onboarding/types";
import { ClinicalOnboardingSchema } from "@/screens/onboarding/types";
import {
  buildClinicalPayload,
  buildHealthProfilesPayload,
  makeEmptyAllergy,
  makeEmptyCondition,
} from "@/screens/onboarding/utils/clinicalForm";
import { useRouter } from "expo-router";

export default function ClinicalForm({
  defaults,
}: {
  defaults?: Partial<TClinicalOnboardingFormValues>;
}) {
  const router = useRouter();
  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<TClinicalOnboardingFormValues>({
    defaultValues: {
      acrCategory: defaults?.acrCategory ?? "",
      allergies: defaults?.allergies ?? [],
      careTeam: defaults?.careTeam ?? [],
      ckdStage: defaults?.ckdStage ?? undefined,
      conditions: defaults?.conditions ?? [],
      contraindications: defaults?.contraindications ?? [],
      dialysisStatus: defaults?.dialysisStatus ?? "none",
      dietaryPreferences: defaults?.dietaryPreferences ?? [],
      egfrCurrent: defaults?.egfrCurrent ?? "",
      heightCm: defaults?.heightCm ?? "",
      weightKg: defaults?.weightKg ?? "",
    },
    resolver: zodResolver(
      ClinicalOnboardingSchema,
    ) as unknown as Resolver<TClinicalOnboardingFormValues>,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      const draft =
        await onboardingDrafts.loadClinicalDraft<TClinicalOnboardingFormValues>();
      if (active && draft) {
        reset({ ...getValues(), ...draft });
      }
    })();

    return () => {
      active = false;
    };
  }, [getValues, reset]);

  const allergiesArray = useFieldArray({ control, name: "allergies" });
  const conditionsArray = useFieldArray({ control, name: "conditions" });
  const allergyValues = useWatch({ control, name: "allergies" }) ?? [];
  const conditionValues = useWatch({ control, name: "conditions" }) ?? [];
  const dietaryPreferences =
    useWatch({
      control,
      name: "dietaryPreferences",
    }) ?? [];

  async function persistIfValid(
    fieldName: Path<TClinicalOnboardingFormValues>,
  ) {
    const valid = await trigger(fieldName);
    if (!valid) return;
    await onboardingDrafts.saveClinicalDraft<TClinicalOnboardingFormValues>(
      getValues(),
    );
  }

  async function persistDraftSnapshot() {
    await onboardingDrafts.saveClinicalDraft<TClinicalOnboardingFormValues>(
      getValues(),
    );
  }

  function updateAllergy(index: number, next: TAllergyFormItem) {
    setValue(`allergies.${index}`, next, { shouldDirty: true });
    void persistDraftSnapshot();
  }

  function updateCondition(index: number, next: TConditionFormItem) {
    setValue(`conditions.${index}`, next, { shouldDirty: true });
    void persistDraftSnapshot();
  }

  function updateDietaryPreferences(next: DietaryPreferenceInput[]) {
    setValue("dietaryPreferences", next, { shouldDirty: true });
    void persistDraftSnapshot();
  }

  async function onSubmit(values: TClinicalOnboardingFormValues) {
    const clinicalPayload = buildClinicalPayload(values);
    const healthProfilesPayload = buildHealthProfilesPayload(values);

    try {
      const clinicalRes = await authFetch(`${API}/api/users/clinical/create`, {
        body: JSON.stringify(clinicalPayload),
        method: "POST",
      });
      if (!clinicalRes.ok) {
        const errBody = await clinicalRes.json().catch(() => null);
        throw new Error(formatApiError(clinicalRes.status, errBody));
      }

      const profileRes = await authFetch(`${API}/api/health-profiles`, {
        body: JSON.stringify(healthProfilesPayload),
        method: "POST",
      });
      if (!profileRes.ok) {
        const errBody = await profileRes.json().catch(() => null);
        throw new Error(formatApiError(profileRes.status, errBody));
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
      <KidneyStatusSection
        control={control}
        errors={errors}
        persistIfValid={persistIfValid}
      />

      <BodyMeasurementsSection
        control={control}
        errors={errors}
        persistIfValid={persistIfValid}
      />

      <AllergiesSection
        allergyFields={allergiesArray.fields}
        allergyValues={allergyValues}
        errors={errors}
        onAdd={() => allergiesArray.append(makeEmptyAllergy())}
        onRemove={(index) => allergiesArray.remove(index)}
        onUpdate={updateAllergy}
        persistDraftSnapshot={persistDraftSnapshot}
      />

      <DietaryPreferencesSection
        dietaryPreferences={dietaryPreferences}
        onSave={updateDietaryPreferences}
      />

      <ConditionsSection
        conditionFields={conditionsArray.fields}
        conditionValues={conditionValues}
        errors={errors}
        onAdd={() => conditionsArray.append(makeEmptyCondition())}
        onRemove={(index) => conditionsArray.remove(index)}
        onUpdate={updateCondition}
        persistDraftSnapshot={persistDraftSnapshot}
      />

      <PrimaryButton
        label={isSubmitting ? "Saving..." : "Save Profile"}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </OnboardingFormScreen>
  );
}
