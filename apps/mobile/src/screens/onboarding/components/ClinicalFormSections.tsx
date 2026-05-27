import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  type Control,
  Controller,
  type FieldErrors,
  type Path,
} from "react-hook-form";

import {
  ACR,
  ALLERGY_GROUP_OPTIONS,
  CKD_STAGE_VALUES,
  DialysisStatus,
  DIETARY_PREFERENCE_OPTIONS,
  ENVIRONMENTAL_ALLERGENS,
  FOOD_ALLERGENS,
  LATEX_ALLERGENS,
  type TAllergyFormItem,
  type TConditionFormItem,
} from "@ckd/core";

import { AutocompleteSelectionField } from "@/screens/onboarding/components/AutocompleteSelectionField";
import {
  PrimaryButton,
  SecondaryButton,
  TertiaryDangerButton,
} from "@/screens/onboarding/components/Buttons";
import {
  LabeledInput,
  OptionSelectField,
} from "@/screens/onboarding/components/FormFields";
import { Section } from "@/screens/onboarding/components/Section";
import type {
  ConditionSearchItem,
  DietaryPreferenceInput,
  MedicationSearchItem,
  TClinicalOnboardingFormValues,
} from "@/screens/onboarding/types";
import {
  allergySeverityOptions,
  conditionStatusOptions,
  findOptionByKey,
  makeEmptyAllergy,
  makeEmptyCondition,
  searchConditions,
  searchMedications,
} from "@/screens/onboarding/utils/clinicalForm";

export function KidneyStatusSection({
  control,
  errors,
  persistIfValid,
}: {
  control: Control<TClinicalOnboardingFormValues>;
  errors: FieldErrors<TClinicalOnboardingFormValues>;
  persistIfValid: (
    fieldName: Path<TClinicalOnboardingFormValues>,
  ) => Promise<void>;
}) {
  return (
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
  );
}

export function BodyMeasurementsSection({
  control,
  errors,
  persistIfValid,
}: {
  control: Control<TClinicalOnboardingFormValues>;
  errors: FieldErrors<TClinicalOnboardingFormValues>;
  persistIfValid: (
    fieldName: Path<TClinicalOnboardingFormValues>,
  ) => Promise<void>;
}) {
  return (
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
  );
}

export function AllergiesSection({
  allergyFields,
  allergyValues,
  errors,
  onAdd,
  onRemove,
  onUpdate,
  persistDraftSnapshot,
}: {
  allergyFields: { id: string }[];
  allergyValues: TAllergyFormItem[];
  errors: FieldErrors<TClinicalOnboardingFormValues>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, next: TAllergyFormItem) => void;
  persistDraftSnapshot: () => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (allergyFields.length === 0) {
      setActiveIndex(null);
      return;
    }

    if (activeIndex !== null && activeIndex >= allergyFields.length) {
      setActiveIndex(allergyFields.length - 1);
    }
  }, [activeIndex, allergyFields.length]);

  return (
    <Section
      title="Allergies"
      description="Add structured allergies so they can be reviewed consistently later."
      emptyLabel="No allergies added"
      addLabel=""
      onAdd={() => undefined}
    >
      {allergyFields.map((field, index) => {
        const allergy = allergyValues[index] ?? makeEmptyAllergy();
        const isEditing = activeIndex === index;

        return (
          <View key={field.id} style={{ gap: 10 }}>
            {!isEditing ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveIndex(index)}
                style={{
                  backgroundColor: "#ffffff",
                  borderColor: "#d1d5db",
                  borderRadius: 12,
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: "#111827", fontWeight: "600" }}>
                  {summarizeAllergy(allergy)}
                </Text>
              </Pressable>
            ) : (
              <AllergyEditor
                allergy={allergy}
                allergyError={
                  errors.allergies?.[index] as
                    | Record<string, { message?: string }>
                    | undefined
                }
                index={index}
                onDone={() => setActiveIndex(null)}
                onRemove={() => {
                  onRemove(index);
                  setActiveIndex((current) => {
                    if (current === null) return null;
                    if (current === index) return null;
                    if (current > index) return current - 1;
                    return current;
                  });
                  void persistDraftSnapshot();
                }}
                onUpdate={onUpdate}
              />
            )}
          </View>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const nextIndex = allergyFields.length;
          onAdd();
          setActiveIndex(nextIndex);
          void persistDraftSnapshot();
        }}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#ffffff",
          borderColor: "#d1d5db",
          borderRadius: 12,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: "#111827", fontWeight: "600" }}>Add allergy</Text>
      </Pressable>
    </Section>
  );
}

const DIETARY_PREFERENCE_DESCRIPTIONS: Record<string, string> = {
  dairy_free: "Avoids milk and dairy products.",
  diabetic_friendly: "Supports steadier carbohydrate and sugar intake.",
  egg_free: "Avoids eggs and egg-based ingredients.",
  gluten_free: "Avoids foods containing gluten.",
  halal: "Follows halal dietary rules.",
  kosher: "Follows kosher dietary rules.",
  low_fat: "Prefers meals lower in overall fat.",
  low_salt: "Prefers meals lower in sodium.",
  low_sugar: "Prefers meals lower in added sugars.",
  nut_free: "Avoids peanuts and tree nuts.",
  pescatarian: "Includes fish but excludes other meat.",
  soy_free: "Avoids soy and soy-derived ingredients.",
  vegan: "Excludes all animal products.",
  vegetarian: "Excludes meat and fish.",
};

function truncateSummary(value: string, maxLength = 36) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function summarizeAllergy(allergy: TAllergyFormItem) {
  const detail =
    "childLabel" in allergy && allergy.childLabel
      ? `${allergy.label}: ${allergy.childLabel}`
      : allergy.label;
  return truncateSummary(
    [detail || "Untitled allergy", allergy.severity].filter(Boolean).join(", "),
  );
}

function summarizeDietaryPreferences(
  dietaryPreferences: DietaryPreferenceInput[],
  maxLength = 36,
) {
  const summary = dietaryPreferences.map((item) => item.label).join(", ");
  if (summary.length <= maxLength) {
    return summary;
  }
  return `${summary.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function DietaryPreferencesSection({
  dietaryPreferences,
  onSave,
}: {
  dietaryPreferences: DietaryPreferenceInput[];
  onSave: (next: DietaryPreferenceInput[]) => void;
}) {
  const [modalVisible, setModalVisible] = React.useState(false);
  const [draftPreferences, setDraftPreferences] =
    React.useState<DietaryPreferenceInput[]>(dietaryPreferences);

  React.useEffect(() => {
    setDraftPreferences(dietaryPreferences);
  }, [dietaryPreferences]);

  function toggleDraftPreference(key: string, label: string) {
    const exists = draftPreferences.some((item) => item.key === key);
    setDraftPreferences(
      exists
        ? draftPreferences.filter((item) => item.key !== key)
        : [...draftPreferences, { key: key as never, label }],
    );
  }

  const hasSelections = dietaryPreferences.length > 0;
  const summary = hasSelections
    ? summarizeDietaryPreferences(dietaryPreferences)
    : null;

  return (
    <>
      <Section
        title="Dietary preferences"
        description="Select the dietary preferences that apply to you."
        emptyLabel="No dietary preferences selected"
        addLabel=""
        onAdd={() => undefined}
      >
        {summary ? (
          <Text style={{ color: "#0F172A", fontSize: 15, lineHeight: 22 }}>
            {summary}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraftPreferences(dietaryPreferences);
            setModalVisible(true);
          }}
          style={{
            alignSelf: "flex-start",
            backgroundColor: "#ffffff",
            borderColor: "#d1d5db",
            borderRadius: 12,
            borderWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: "#111827", fontWeight: "600" }}>
            {hasSelections
              ? "Edit Dietary Preferences"
              : "Add Dietary Preferences"}
          </Text>
        </Pressable>
      </Section>

      <Modal
        transparent
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={{
            backgroundColor: "rgba(15,23,42,0.48)",
            flex: 1,
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 22,
              gap: 14,
              maxHeight: "80%",
              padding: 18,
            }}
          >
            <Text style={{ color: "#0F172A", fontSize: 18, fontWeight: "700" }}>
              Dietary preferences
            </Text>
            <Text style={{ color: "#475569", lineHeight: 20 }}>
              Choose all options that apply. These help tailor future meal and
              guidance suggestions.
            </Text>
            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {DIETARY_PREFERENCE_OPTIONS.map((option) => {
                const selected = draftPreferences.some(
                  (item) => item.key === option.key,
                );
                return (
                  <Pressable
                    key={option.key}
                    onPress={() =>
                      toggleDraftPreference(option.key, option.label)
                    }
                    style={{
                      backgroundColor: selected
                        ? "rgba(15,118,110,0.08)"
                        : "#F8FAFC",
                      borderColor: selected
                        ? "#0F766E"
                        : "rgba(148,163,184,0.35)",
                      borderRadius: 14,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? "#0F766E" : "#FFFFFF",
                        borderColor: selected
                          ? "#0F766E"
                          : "rgba(148,163,184,0.65)",
                        borderRadius: 6,
                        borderWidth: 1.5,
                        height: 22,
                        justifyContent: "center",
                        marginTop: 1,
                        width: 22,
                      }}
                    >
                      {selected ? (
                        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                          ✓
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          color: "#0F172A",
                          fontSize: 15,
                          fontWeight: "700",
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text style={{ color: "#475569", lineHeight: 20 }}>
                        {DIETARY_PREFERENCE_DESCRIPTIONS[option.key]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <SecondaryButton
                label="Cancel"
                onPress={() => {
                  setDraftPreferences(dietaryPreferences);
                  setModalVisible(false);
                }}
              />
              <PrimaryButton
                label="Done"
                onPress={() => {
                  onSave(draftPreferences);
                  setModalVisible(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function ConditionsSection({
  conditionFields,
  conditionValues,
  errors,
  onAdd,
  onRemove,
  onUpdate,
  persistDraftSnapshot,
}: {
  conditionFields: { id: string }[];
  conditionValues: TConditionFormItem[];
  errors: FieldErrors<TClinicalOnboardingFormValues>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, next: TConditionFormItem) => void;
  persistDraftSnapshot: () => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (conditionFields.length === 0) {
      setActiveIndex(null);
      return;
    }

    if (activeIndex !== null && activeIndex >= conditionFields.length) {
      setActiveIndex(conditionFields.length - 1);
    }
  }, [activeIndex, conditionFields.length]);

  return (
    <Section
      title="Other conditions"
      description="Search the NHS terminology server to add structured conditions."
      emptyLabel="No conditions added"
      addLabel=""
      onAdd={() => undefined}
    >
      {conditionFields.map((field, index) => {
        const condition = conditionValues[index] ?? makeEmptyCondition();
        const isEditing = activeIndex === index;

        return (
          <View key={field.id} style={{ gap: 10 }}>
            {!isEditing ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveIndex(index)}
                style={{
                  backgroundColor: "#ffffff",
                  borderColor: "#d1d5db",
                  borderRadius: 12,
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: "#111827", fontWeight: "600" }}>
                  {summarizeCondition(condition)}
                </Text>
              </Pressable>
            ) : (
              <ConditionEditor
                condition={condition}
                conditionError={
                  errors.conditions?.[index]
                    ? {
                        code: {
                          message: (errors.conditions[index] as any)?.code
                            ?.message,
                        },
                        label: {
                          message: (errors.conditions[index] as any)?.label
                            ?.message,
                        },
                      }
                    : undefined
                }
                index={index}
                onDone={() => setActiveIndex(null)}
                onRemove={() => {
                  onRemove(index);
                  setActiveIndex((current) => {
                    if (current === null) return null;
                    if (current === index) return null;
                    if (current > index) return current - 1;
                    return current;
                  });
                  void persistDraftSnapshot();
                }}
                onUpdate={onUpdate}
              />
            )}
          </View>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const nextIndex = conditionFields.length;
          onAdd();
          setActiveIndex(nextIndex);
          void persistDraftSnapshot();
        }}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#ffffff",
          borderColor: "#d1d5db",
          borderRadius: 12,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: "#111827", fontWeight: "600" }}>
          Add condition
        </Text>
      </Pressable>
    </Section>
  );
}

function summarizeCondition(condition: TConditionFormItem) {
  return truncateSummary(
    [condition.label || "Untitled condition", condition.status]
      .filter(Boolean)
      .join(", "),
  );
}

function AllergyEditor({
  allergy,
  allergyError,
  index,
  onDone,
  onRemove,
  onUpdate,
}: {
  allergy: TAllergyFormItem;
  allergyError?: Record<string, { message?: string }>;
  index: number;
  onDone: () => void;
  onRemove: () => void;
  onUpdate: (index: number, next: TAllergyFormItem) => void;
}) {
  const foodOption =
    allergy.group === "food"
      ? findOptionByKey(FOOD_ALLERGENS, allergy.key)
      : null;
  const environmentalOption =
    allergy.group === "environmental"
      ? findOptionByKey(ENVIRONMENTAL_ALLERGENS, allergy.key)
      : null;
  const requiresFoodChild =
    allergy.group === "food" && !!foodOption?.children?.length;
  const requiresEnvironmentalChild =
    allergy.group === "environmental" &&
    !!environmentalOption?.children?.length;
  const hasCompleteAllergy =
    (allergy.group === "food" &&
      allergy.key.trim().length > 0 &&
      allergy.label.trim().length > 0 &&
      (!requiresFoodChild ||
        (!!allergy.childKey?.trim().length &&
          !!allergy.childLabel?.trim().length))) ||
    (allergy.group === "medication" && allergy.label.trim().length > 0) ||
    (allergy.group === "environmental" &&
      allergy.key.trim().length > 0 &&
      allergy.label.trim().length > 0 &&
      (!requiresEnvironmentalChild ||
        (!!allergy.childKey?.trim().length &&
          !!allergy.childLabel?.trim().length))) ||
    (allergy.group === "latex" &&
      allergy.key.trim().length > 0 &&
      allergy.label.trim().length > 0) ||
    (allergy.group === "other" && allergy.label.trim().length > 0);
  const allergyValidationMessage =
    (allergyError?.key?.message as string | undefined) ??
    (allergyError?.label?.message as string | undefined);

  return (
    <View style={{ borderRadius: 12, borderWidth: 1, gap: 12, padding: 12 }}>
      <OptionSelectField
        label="Allergy group"
        value={allergy.group}
        options={ALLERGY_GROUP_OPTIONS.map((option) => ({
          label: option.label,
          value: option.key,
        }))}
        onChange={(group) => onUpdate(index, makeEmptyAllergy(group))}
      />

      {allergy.group === "food" && (
        <>
          <OptionSelectField
            label="Food allergen"
            value={allergy.key || undefined}
            options={FOOD_ALLERGENS.map((option) => ({
              label: option.label,
              value: option.key,
            }))}
            onChange={(key) => {
              const option = findOptionByKey(FOOD_ALLERGENS, key);
              if (!option) return;
              onUpdate(index, {
                ...allergy,
                key: option.key,
                label: option.label,
                ...(option.children?.length
                  ? {}
                  : { childKey: undefined, childLabel: undefined }),
              });
            }}
            error={allergyValidationMessage}
          />
          {!!foodOption?.children?.length && (
            <OptionSelectField
              label="Specific food"
              value={allergy.childKey}
              options={foodOption.children.map((child) => ({
                label: child.label,
                value: child.key,
              }))}
              onChange={(childKey) => {
                const child = foodOption.children?.find(
                  (option) => option.key === childKey,
                );
                if (!child) return;
                onUpdate(index, {
                  ...allergy,
                  childKey: child.key,
                  childLabel: child.label,
                });
              }}
            />
          )}
        </>
      )}

      {allergy.group === "medication" && (
        <AutocompleteSelectionField
          label="Medication"
          placeholder="Search medication"
          value={allergy.label}
          error={allergyValidationMessage}
          onSearch={searchMedications}
          onSelect={(option) => {
            const item = option.value as MedicationSearchItem;
            onUpdate(index, {
              ...allergy,
              dmplusdCode: item.dmplusdCode ?? undefined,
              label: option.label,
              medicationCode: item.dmplusdCode ?? item.snomedCode ?? item.id,
              medicationCodeSystem: item.dmplusdCode
                ? "DM_D"
                : item.snomedCode
                  ? "SNOMED_CT"
                  : "CUSTOM",
              medicationRefId: item.id,
              snomedCode: item.snomedCode ?? undefined,
            });
          }}
        />
      )}

      {allergy.group === "environmental" && (
        <>
          <OptionSelectField
            label="Environmental allergen"
            value={allergy.key || undefined}
            options={ENVIRONMENTAL_ALLERGENS.map((option) => ({
              label: option.label,
              value: option.key,
            }))}
            onChange={(key) => {
              const option = findOptionByKey(ENVIRONMENTAL_ALLERGENS, key);
              if (!option) return;
              onUpdate(index, {
                ...allergy,
                key: option.key,
                label: option.label,
                ...(option.children?.length
                  ? {}
                  : { childKey: undefined, childLabel: undefined }),
              });
            }}
            error={allergyValidationMessage}
          />
          {!!environmentalOption?.children?.length && (
            <OptionSelectField
              label="Specific trigger"
              value={allergy.childKey}
              options={environmentalOption.children.map((child) => ({
                label: child.label,
                value: child.key,
              }))}
              onChange={(childKey) => {
                const child = environmentalOption.children?.find(
                  (option) => option.key === childKey,
                );
                if (!child) return;
                onUpdate(index, {
                  ...allergy,
                  childKey: child.key,
                  childLabel: child.label,
                });
              }}
            />
          )}
        </>
      )}

      {allergy.group === "latex" && (
        <OptionSelectField
          label="Latex allergen"
          value={allergy.key || undefined}
          options={LATEX_ALLERGENS.map((option) => ({
            label: option.label,
            value: option.key,
          }))}
          onChange={(key) => {
            const option = findOptionByKey(LATEX_ALLERGENS, key);
            if (!option) return;
            onUpdate(index, {
              ...allergy,
              key: option.key,
              label: option.label,
            });
          }}
          error={allergyValidationMessage}
        />
      )}

      {allergy.group === "other" && (
        <LabeledInput
          label="Other allergen"
          value={allergy.label}
          onChangeText={(text) =>
            onUpdate(index, {
              ...allergy,
              key: "other",
              label: text,
            })
          }
          error={allergyValidationMessage}
        />
      )}

      <OptionSelectField
        label="Severity"
        value={allergy.severity}
        options={allergySeverityOptions.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        onChange={(severity) => onUpdate(index, { ...allergy, severity })}
      />

      <View
        style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}
      >
        <SecondaryButton
          label={hasCompleteAllergy ? "Done" : "Cancel"}
          onPress={hasCompleteAllergy ? onDone : onRemove}
        />
        <TertiaryDangerButton
          label="Remove allergy"
          disabled={!hasCompleteAllergy}
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

function ConditionEditor({
  condition,
  conditionError,
  index,
  onDone,
  onRemove,
  onUpdate,
}: {
  condition: TConditionFormItem;
  conditionError?: Record<string, { message?: string }>;
  index: number;
  onDone: () => void;
  onRemove: () => void;
  onUpdate: (index: number, next: TConditionFormItem) => void;
}) {
  const hasSelectedCondition =
    condition.label.trim().length > 0 && condition.code.trim().length > 0;
  const conditionValidationMessage =
    (conditionError?.label?.message as string | undefined) ??
    (conditionError?.code?.message as string | undefined);

  return (
    <View style={{ borderRadius: 12, borderWidth: 1, gap: 12, padding: 12 }}>
      <AutocompleteSelectionField
        label="Condition"
        placeholder="Search condition"
        value={condition.label}
        error={conditionValidationMessage}
        onSearch={searchConditions}
        onSelect={(option) => {
          const item = option.value as ConditionSearchItem;
          onUpdate(index, {
            ...condition,
            code: item.code,
            codeSystem: item.codeSystem,
            label: item.label,
          });
        }}
      />

      <OptionSelectField
        label="Status"
        value={condition.status}
        options={conditionStatusOptions}
        onChange={(status) => onUpdate(index, { ...condition, status })}
      />

      <View
        style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}
      >
        <SecondaryButton
          label={hasSelectedCondition ? "Done" : "Cancel"}
          onPress={hasSelectedCondition ? onDone : onRemove}
        />
        <TertiaryDangerButton
          label="Remove condition"
          disabled={!hasSelectedCondition}
          onPress={onRemove}
        />
      </View>
    </View>
  );
}
