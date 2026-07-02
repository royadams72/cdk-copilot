import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Controller, type Path, type Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";

import { PiiForm, type TPiiInput } from "@ckd/core";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import { onboardingDrafts } from "@/lib/onboarding";
import {
  OptionSelectField,
  PickerField,
  SelectionField,
} from "../components/FormFields";
import { PrimaryButton, SecondaryButton } from "../components/Buttons";
import { DateField } from "../components/DateField";
import { OnboardingFormScreen } from "../components/Onboarding";

type SexAtBirth = TPiiInput["sexAtBirth"] | "";
type Units = TPiiInput["units"];
type GenderIdentitySameAsBirth = "yes" | "no" | "prefer_not_to_say" | "unknown";

const SEX_AT_BIRTH_OPTIONS: Array<{ label: string; value: SexAtBirth }> = [
  { label: "Select", value: "" },
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Intersex", value: "intersex" },
  { label: "Unknown / not recorded", value: "unknown" },
];

const GENDER_IDENTITY_SAME_AS_BIRTH_OPTIONS: Array<{
  label: string;
  value: GenderIdentitySameAsBirth;
}> = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
  { label: "Unknown / not recorded", value: "unknown" },
];

const GENDER_IDENTITY_OPTIONS = [
  { label: "Woman", value: "woman" },
  { label: "Man", value: "man" },
  { label: "Non-binary", value: "non_binary" },
  { label: "Another identity", value: "another_identity" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
  { label: "Unknown / not recorded", value: "unknown" },
] as const;

const ETHNICITY_GROUPS = [
  {
    label: "Asian or Asian British",
    options: [
      { label: "Indian", value: "indian" },
      { label: "Pakistani", value: "pakistani" },
      { label: "Bangladeshi", value: "bangladeshi" },
      { label: "Chinese", value: "chinese" },
      { label: "Any other Asian background", value: "other_asian_background" },
    ],
  },
  {
    label: "Black, Black British, Caribbean or African",
    options: [
      { label: "African", value: "african" },
      { label: "Caribbean", value: "caribbean" },
      {
        label:
          "Any other Black, Black British, Caribbean or African background",
        value: "other_black_background",
      },
    ],
  },
  {
    label: "Mixed or multiple ethnic groups",
    options: [
      {
        label: "White and Black Caribbean",
        value: "white_and_black_caribbean",
      },
      {
        label: "White and Black African",
        value: "white_and_black_african",
      },
      { label: "White and Asian", value: "white_and_asian" },
      {
        label: "Any other Mixed or multiple ethnic background",
        value: "other_mixed_background",
      },
    ],
  },
  {
    label: "Other ethnic group",
    options: [
      { label: "Arab", value: "arab" },
      { label: "Any other ethnic group", value: "other_ethnic_group" },
    ],
  },
  {
    label: "White",
    options: [
      {
        label: "English, Welsh, Scottish, Northern Irish or British",
        value: "english_welsh_scottish_northern_irish_or_british",
      },
      { label: "Irish", value: "irish" },
      { label: "Gypsy or Irish Traveller", value: "gypsy_or_irish_traveller" },
      { label: "Roma", value: "roma" },
      { label: "Any other White background", value: "other_white_background" },
    ],
  },
  {
    label: "Prefer not to say",
    options: [{ label: "Prefer not to say", value: "prefer_not_to_say" }],
  },
  {
    label: "Unknown / not recorded",
    options: [{ label: "Unknown / not recorded", value: "unknown" }],
  },
] as const;

const ETHNICITY_LABELS = Object.fromEntries(
  ETHNICITY_GROUPS.flatMap((group) =>
    group.options.map((option) => [option.value, option.label]),
  ),
) as Record<string, string>;

function inferGenderIdentitySameAsBirth(
  sexAtBirth: SexAtBirth,
  genderIdentity: string | null | undefined,
): GenderIdentitySameAsBirth {
  if (!genderIdentity || genderIdentity === sexAtBirth) {
    return "yes";
  }
  if (genderIdentity === "prefer_not_to_say" || genderIdentity === "unknown") {
    return genderIdentity;
  }
  return "no";
}

function buildGenderIdentityValue(
  sexAtBirth: SexAtBirth,
  sameAsBirth: GenderIdentitySameAsBirth,
  selectedIdentity: string | null,
) {
  if (sameAsBirth === "yes") return sexAtBirth;
  if (sameAsBirth === "no") return selectedIdentity;
  return sameAsBirth;
}

function formatPhoneForDisplay(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith("+44")) return value.slice(3);
  return value.replace(/^\+/, "");
}

function normalizeUkPhoneInput(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

function toUkPhoneE164(input: string) {
  const digits = normalizeUkPhoneInput(input);
  if (!digits) return null;
  return `+44${digits}`;
}

function normalizePiiFormValues(value: Partial<TPiiInput>): Partial<TPiiInput> {
  const normalizedDob =
    value.dateOfBirth instanceof Date
      ? value.dateOfBirth.toISOString()
      : (value.dateOfBirth ?? null);

  return {
    ...value,
    dateOfBirth: normalizedDob as TPiiInput["dateOfBirth"],
    nhsNumber: value.nhsNumber?.replace(/\s+/g, "") ?? null,
  };
}

export default function OnboardingPiiForm({
  defaults,
}: {
  defaults?: Partial<TPiiInput>;
}) {
  const [saving, setSaving] = useState(false);
  const [genderIdentitySameAsBirth, setGenderIdentitySameAsBirth] =
    useState<GenderIdentitySameAsBirth>(
      inferGenderIdentitySameAsBirth(
        (defaults?.sexAtBirth as SexAtBirth) ?? "unknown",
        defaults?.genderIdentity,
      ),
    );
  const [ethnicityModalVisible, setEthnicityModalVisible] = useState(false);
  const [ethnicityDraft, setEthnicityDraft] = useState<string | null>(null);
  const router = useRouter();

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setValue,
    trigger,
    formState: { errors, isSubmitting, isLoading },
  } = useForm<TPiiInput>({
    defaultValues: {
      phoneE164: null,
      firstName: "",
      lastName: "",
      nhsNumber: null,
      dateOfBirth: null,
      sexAtBirth: "" as TPiiInput["sexAtBirth"],
      genderIdentity: null,
      ethnicity: null,
      units: "metric",
      notificationPrefs: { email: true, push: true, sms: false },
      ...defaults,
    },
    mode: "onSubmit",
    resolver: zodResolver(PiiForm) as unknown as Resolver<TPiiInput>,
  });

  const showGenderIdentityPicker = genderIdentitySameAsBirth === "no";

  useEffect(() => {
    let active = true;

    (async () => {
      const [draft, currentRes] = await Promise.all([
        onboardingDrafts.loadPiiDraft<TPiiInput>(),
        authFetch(`${API}/api/users/pii/current`).catch(() => null),
      ]);

      const currentBody =
        currentRes && currentRes.ok
          ? ((await currentRes.json().catch(() => null)) as
              | {
                  data?: {
                    dateOfBirth?: string | null;
                    firstName?: string | null;
                    lastName?: string | null;
                    nhsNumber?: string | null;
                    units?: Units;
                  };
                }
              | null)
          : null;

      if (active) {
        const nextValues = normalizePiiFormValues({
          ...getValues(),
          dateOfBirth: currentBody?.data?.dateOfBirth ?? defaults?.dateOfBirth ?? null,
          firstName: currentBody?.data?.firstName ?? defaults?.firstName ?? "",
          lastName: currentBody?.data?.lastName ?? defaults?.lastName ?? "",
          nhsNumber: currentBody?.data?.nhsNumber ?? defaults?.nhsNumber ?? null,
          units: currentBody?.data?.units ?? defaults?.units ?? "metric",
          ...(draft ?? {}),
        });
        reset(nextValues);
        setGenderIdentitySameAsBirth(
          inferGenderIdentitySameAsBirth(
            (nextValues.sexAtBirth as SexAtBirth) ?? "unknown",
            nextValues.genderIdentity,
          ),
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [getValues, reset]);

  async function persistIfValid(fieldName: Path<TPiiInput>) {
    const valid = await trigger(fieldName);
    if (!valid) return;
    await onboardingDrafts.savePiiDraft<TPiiInput>(
      normalizePiiFormValues(getValues()),
    );
  }

  async function saveDraft() {
    await onboardingDrafts.savePiiDraft<TPiiInput>(
      normalizePiiFormValues(getValues()),
    );
  }

  async function onSubmit(payload: TPiiInput) {
    try {
      setSaving(true);
      const body = JSON.stringify(normalizePiiFormValues(payload));
      const res = await authFetch(`${API}/api/users/pii/create`, {
        body,
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(formatApiError(res.status, errBody));
      }
      router.push("/(auth)/onboarding/clinical-form");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <OnboardingFormScreen
        title="Your information"
        subtitle="Add your details so we can set up your profile."
      >
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={() => {
                  onBlur();
                  void persistIfValid("firstName");
                }}
                placeholder="First name"
                autoCapitalize="words"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
              {!!errors.firstName && (
                <Text style={styles.errorText}>
                  {String(errors.firstName.message)}
                </Text>
              )}
            </View>
          )}
        />

        <Controller
          control={control}
          name="lastName"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={() => {
                  onBlur();
                  void persistIfValid("lastName");
                }}
                onFocus={() => {
                  void persistIfValid("firstName");
                }}
                placeholder="Last name"
                autoCapitalize="words"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
              {!!errors.lastName && (
                <Text style={styles.errorText}>
                  {String(errors.lastName.message)}
                </Text>
              )}
            </View>
          )}
        />

        <Controller
          control={control}
          name="nhsNumber"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>NHS number</Text>
              <TextInput
                value={value ?? ""}
                onChangeText={(text) => onChange(text.replace(/\s+/g, ""))}
                onBlur={() => {
                  onBlur();
                  void persistIfValid("nhsNumber");
                }}
                onFocus={() => {
                  void persistIfValid("lastName");
                }}
                placeholder="10 digit NHS number"
                keyboardType="number-pad"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
              {!!errors.nhsNumber && (
                <Text style={styles.errorText}>
                  {String(errors.nhsNumber.message)}
                </Text>
              )}
            </View>
          )}
        />

        <Controller
          control={control}
          name="phoneE164"
          render={({ field: { onChange, value } }) => (
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Phone number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+44</Text>
                </View>
                <TextInput
                  value={formatPhoneForDisplay(value)}
                  onChangeText={(text) => onChange(toUkPhoneE164(text))}
                  onBlur={() => {
                    void persistIfValid("phoneE164");
                  }}
                  onFocus={() => {
                    void persistIfValid("lastName");
                  }}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  placeholderTextColor="#64748B"
                  style={[styles.input, styles.phoneInput]}
                />
              </View>
              {!!errors.phoneE164 && (
                <Text style={styles.errorText}>
                  {String(errors.phoneE164.message)}
                </Text>
              )}
            </View>
          )}
        />

        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field: { onChange, value } }) => (
            <DateField
              label="Date of birth"
              value={value as string | null}
              onChange={(nextValue) => {
                onChange(nextValue as any);
                void persistIfValid("dateOfBirth");
              }}
              error={errors.dateOfBirth?.message as string | undefined}
            />
          )}
        />

        <Controller
          control={control}
          name="sexAtBirth"
          render={({ field: { onChange, value } }) => (
            <OptionSelectField
              label="Sex at birth"
              placeholder="Select"
              value={(value as SexAtBirth) || undefined}
              options={SEX_AT_BIRTH_OPTIONS.filter((option) => option.value !== "")}
              onChange={(nextValue) => {
                const sexValue = nextValue as SexAtBirth;
                onChange(sexValue);
                if (genderIdentitySameAsBirth === "yes") {
                  setValue("genderIdentity", sexValue as any, {
                    shouldValidate: false,
                  });
                }
                void persistIfValid("sexAtBirth");
                void saveDraft();
              }}
              error={errors.sexAtBirth?.message as string | undefined}
            />
          )}
        />

        <OptionSelectField
          label="Gender identity same as birth"
          value={genderIdentitySameAsBirth}
          options={GENDER_IDENTITY_SAME_AS_BIRTH_OPTIONS}
          onChange={(nextValue) => {
            const sameValue = nextValue as GenderIdentitySameAsBirth;
            const currentSex = getValues("sexAtBirth") as SexAtBirth;
            setGenderIdentitySameAsBirth(sameValue);

            if (sameValue === "no") {
              const currentIdentity = getValues("genderIdentity");
              const derivedIdentity =
                currentIdentity &&
                currentIdentity !== currentSex &&
                currentIdentity !== "prefer_not_to_say" &&
                currentIdentity !== "unknown"
                  ? currentIdentity
                  : "woman";

              setValue("genderIdentity", derivedIdentity as any, {
                shouldValidate: false,
              });
            } else {
              setValue(
                "genderIdentity",
                buildGenderIdentityValue(
                  currentSex,
                  sameValue,
                  getValues("genderIdentity"),
                ) as any,
                { shouldValidate: false },
              );
            }

            void persistIfValid("genderIdentity");
            void saveDraft();
          }}
        />

        {showGenderIdentityPicker ? (
          <Controller
            control={control}
            name="genderIdentity"
            render={({ field: { onChange, value } }) => (
              <OptionSelectField
                label="Gender identity"
                value={(value as string | null) ?? "woman"}
                options={[...GENDER_IDENTITY_OPTIONS]}
                onChange={(nextValue) => {
                  onChange(nextValue);
                  void persistIfValid("genderIdentity");
                }}
                error={errors.genderIdentity?.message as string | undefined}
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="ethnicity"
          render={({ field: { onChange, value } }) => (
            <SelectionField
              label="Ethnicity"
              value={value ? (ETHNICITY_LABELS[value] ?? value) : null}
              placeholder="Select Ethnicity"
              onPress={() => {
                setEthnicityDraft(value ?? null);
                setEthnicityModalVisible(true);
              }}
              error={errors.ethnicity?.message as string | undefined}
            />
          )}
        />

        <Controller
          control={control}
          name="units"
          render={({ field: { onChange, value } }) => (
            <OptionSelectField
              label="Units"
              value={value as Units}
              options={[
                { label: "Metric", value: "metric" as Units },
                { label: "Imperial", value: "imperial" as Units },
              ]}
              onChange={(nextValue) => {
                onChange(nextValue as Units);
                void persistIfValid("units");
              }}
              error={errors.units?.message as string | undefined}
            />
          )}
        />

        <View style={styles.notificationsBlock}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <Controller
            control={control}
            name="notificationPrefs.email"
            render={({ field: { onChange, value } }) => (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Email</Text>
                <Switch
                  value={!!value}
                  onValueChange={(nextValue) => {
                    onChange(nextValue);
                    void persistIfValid("notificationPrefs.email");
                  }}
                />
              </View>
            )}
          />

          <Controller
            control={control}
            name="notificationPrefs.push"
            render={({ field: { onChange, value } }) => (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Push</Text>
                <Switch
                  value={!!value}
                  onValueChange={(nextValue) => {
                    onChange(nextValue);
                    void persistIfValid("notificationPrefs.push");
                  }}
                />
              </View>
            )}
          />

          <Controller
            control={control}
            name="notificationPrefs.sms"
            render={({ field: { onChange, value } }) => (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>SMS</Text>
                <Switch
                  value={!!value}
                  onValueChange={(nextValue) => {
                    onChange(nextValue);
                    void persistIfValid("notificationPrefs.sms");
                  }}
                />
              </View>
            )}
          />
        </View>

        {!!errors.root && (
          <Text style={styles.errorText}>{String(errors.root.message)}</Text>
        )}

        <PrimaryButton
          label={isSubmitting || saving || isLoading ? "Saving..." : "Save"}
          disabled={isSubmitting || saving || isLoading}
          onPress={handleSubmit(onSubmit)}
        />
      </OnboardingFormScreen>

      <Modal
        transparent
        animationType="slide"
        visible={ethnicityModalVisible}
        onRequestClose={() => setEthnicityModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.ethnicityModalCard}>
            <Text style={styles.modalTitle}>Select Ethnicity</Text>
            <ScrollView contentContainerStyle={styles.ethnicityModalContent}>
              {ETHNICITY_GROUPS.map((group) => (
                <View key={group.label} style={styles.ethnicityGroup}>
                  <Text style={styles.ethnicityGroupTitle}>{group.label}</Text>
                  {group.options.map((option) => {
                    const selected = ethnicityDraft === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() =>
                          setEthnicityDraft(selected ? null : option.value)
                        }
                        style={[
                          styles.ethnicityOption,
                          selected ? styles.ethnicityOptionSelected : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            selected ? styles.checkboxSelected : null,
                          ]}
                        >
                          {selected ? (
                            <Text style={styles.checkboxTick}>✓</Text>
                          ) : null}
                        </View>
                        <Text style={styles.ethnicityOptionText}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <SecondaryButton
                label="Cancel"
                onPress={() => setEthnicityModalVisible(false)}
              />
              <PrimaryButton
                label="Save"
                onPress={() => {
                  setValue("ethnicity", ethnicityDraft as any, {
                    shouldValidate: false,
                  });
                  void persistIfValid("ethnicity");
                  void saveDraft();
                  setEthnicityModalVisible(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(148,163,184,0.65)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxSelected: {
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
  },
  checkboxTick: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  errorText: {
    fontSize: 13,
    color: "#B91C1C",
  },
  ethnicityGroup: {
    gap: 10,
  },
  ethnicityGroupTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  ethnicityModalCard: {
    maxHeight: "80%",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 14,
  },
  ethnicityModalContent: {
    gap: 16,
    paddingBottom: 8,
  },
  ethnicityOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "#F8FAFC",
  },
  ethnicityOptionSelected: {
    borderColor: "#0F766E",
    backgroundColor: "rgba(15,118,110,0.08)",
  },
  ethnicityOptionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "#0F172A",
  },
  fieldBlock: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#F8FAFC",
    fontSize: 16,
    color: "#0F172A",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  notificationsBlock: {
    gap: 12,
  },
  phoneInput: {
    flex: 1,
  },
  phonePrefix: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
    backgroundColor: "#E2E8F0",
  },
  phonePrefixText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  switchLabel: {
    fontSize: 16,
    color: "#0F172A",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "#F8FAFC",
  },
});
