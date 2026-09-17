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
import { Controller, type Path, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";

import { PiiForm, type TPiiFormInput, type TPiiFormOutput } from "@ckd/core";
import { API } from "@/constants/api";
import { theme } from "@/constants/theme";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import { onboardingDrafts } from "@/lib/onboarding";
import { OptionSelectField, SelectionField } from "../components/FormFields";
import { AppButton } from "@/components/ui/button";
import { OnboardingFormScreen } from "../components/Onboarding";
import {
  ControlledDateField,
  ControlledOptionField,
  ControlledTextField,
} from "../components/ControlledFormFields";
import { styles as onboardingStyles } from "../styles";
import {
  ETHNICITY_GROUPS,
  ETHNICITY_LABELS,
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_SAME_AS_BIRTH_OPTIONS,
  GenderIdentitySameAsBirth,
  SEX_AT_BIRTH_OPTIONS,
  SexAtBirth,
  UNIT_OPTIONS,
} from "../definitions/pii";
import {
  buildGenderIdentityValue,
  formatPhoneForDisplay,
  inferGenderIdentitySameAsBirth,
  normalizePiiFormValues,
  toUkPhoneE164,
} from "../utils/piiForm";

export default function OnboardingPiiForm({
  defaults,
}: {
  defaults?: Partial<TPiiFormInput>;
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
  } = useForm<TPiiFormInput, unknown, TPiiFormOutput>({
    defaultValues: {
      phoneE164: null,
      firstName: "",
      lastName: "",
      nhsNumber: null,
      dateOfBirth: null,
      sexAtBirth: "",
      genderIdentity: null,
      ethnicity: null,
      units: "metric",
      notificationPrefs: { email: true, push: true, sms: false },
      ...defaults,
    },
    mode: "onSubmit",
    resolver: zodResolver(PiiForm),
  });

  const showGenderIdentityPicker = genderIdentitySameAsBirth === "no";

  useEffect(() => {
    let active = true;

    (async () => {
      const [draft, currentRes] = await Promise.all([
        onboardingDrafts.loadPiiDraft<TPiiFormInput>(),
        authFetch(`${API}/api/users/pii/current`).catch(() => null),
      ]);

      const currentBody =
        currentRes && currentRes.ok
          ? ((await currentRes.json().catch(() => null)) as {
              data?: {
                dateOfBirth?: string | null;
                firstName?: string | null;
                lastName?: string | null;
                nhsNumber?: string | null;
                units?: TPiiFormInput["units"];
              };
            } | null)
          : null;

      if (active) {
        const nextValues = normalizePiiFormValues({
          ...getValues(),
          dateOfBirth:
            currentBody?.data?.dateOfBirth ?? defaults?.dateOfBirth ?? null,
          firstName: currentBody?.data?.firstName ?? defaults?.firstName ?? "",
          lastName: currentBody?.data?.lastName ?? defaults?.lastName ?? "",
          nhsNumber:
            currentBody?.data?.nhsNumber ?? defaults?.nhsNumber ?? null,
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

  async function persistIfValid(fieldName: Path<TPiiFormInput>) {
    const valid = await trigger(fieldName);
    if (!valid) return;
    await onboardingDrafts.savePiiDraft<TPiiFormInput>(
      normalizePiiFormValues(getValues()),
    );
  }

  async function saveDraft() {
    await onboardingDrafts.savePiiDraft<TPiiFormInput>(
      normalizePiiFormValues(getValues()),
    );
  }

  async function onSubmit(payload: TPiiFormOutput) {
    try {
      setSaving(true);
      const body = JSON.stringify(payload);
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
        <ControlledTextField
          autoCapitalize="words"
          control={control}
          label="First name"
          name="firstName"
          onFieldBlur={() => void persistIfValid("firstName")}
          placeholder="First name"
        />

        <ControlledTextField
          autoCapitalize="words"
          control={control}
          label="Last name"
          name="lastName"
          onFieldBlur={() => void persistIfValid("lastName")}
          onFocus={() => void persistIfValid("firstName")}
          placeholder="Last name"
        />

        <ControlledTextField
          control={control}
          keyboardType="number-pad"
          label="NHS number"
          name="nhsNumber"
          onFieldBlur={() => void persistIfValid("nhsNumber")}
          onFocus={() => void persistIfValid("lastName")}
          placeholder="10 digit NHS number"
        />

        <Controller
          control={control}
          name="phoneE164"
          render={({ field: { onChange, value } }) => (
            <View style={onboardingStyles.fieldBlock}>
              <Text style={onboardingStyles.label}>Phone number</Text>
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
                  placeholderTextColor={theme.colors.textMuted}
                  style={[onboardingStyles.input, styles.phoneInput]}
                />
              </View>
              {!!errors.phoneE164 && (
                <Text style={onboardingStyles.errorText}>
                  {String(errors.phoneE164.message)}
                </Text>
              )}
            </View>
          )}
        />

        <ControlledDateField
          control={control}
          label="Date of birth"
          name="dateOfBirth"
          onValueChange={() => void persistIfValid("dateOfBirth")}
        />

        <Controller
          control={control}
          name="sexAtBirth"
          render={({ field: { onChange, value } }) => (
            <OptionSelectField
              label="Sex at birth"
              placeholder="Select"
              value={(value as SexAtBirth) || undefined}
              options={SEX_AT_BIRTH_OPTIONS.filter(
                (option) => option.value !== "",
              )}
              onChange={(nextValue) => {
                const sexValue = nextValue as SexAtBirth;
                onChange(sexValue);
                if (genderIdentitySameAsBirth === "yes") {
                  setValue("genderIdentity", sexValue, {
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

              setValue("genderIdentity", derivedIdentity, {
                shouldValidate: false,
              });
            } else {
              setValue(
                "genderIdentity",
                buildGenderIdentityValue(
                  currentSex,
                  sameValue,
                  getValues("genderIdentity"),
                ),
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
                value={value ?? "woman"}
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

        <ControlledOptionField
          control={control}
          label="Units"
          name="units"
          onValueChange={() => void persistIfValid("units")}
          options={UNIT_OPTIONS}
        />

        <View style={styles.notificationsBlock}>
          <Text style={onboardingStyles.sectionTitle}>Notifications</Text>

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
          <Text style={onboardingStyles.errorText}>
            {String(errors.root.message)}
          </Text>
        )}

        <AppButton
          variant="primary"
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
        <View style={onboardingStyles.modalBackdrop}>
          <View style={onboardingStyles.modalCardTall}>
            <Text style={onboardingStyles.modalTitle}>Select Ethnicity</Text>
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
                          onboardingStyles.selectionOption,
                          styles.ethnicityOptionCentered,
                          selected
                            ? onboardingStyles.selectionOptionSelected
                            : null,
                        ]}
                      >
                        <View
                          style={[
                            onboardingStyles.checkbox,
                            selected ? onboardingStyles.checkboxSelected : null,
                          ]}
                        >
                          {selected ? (
                            <Text style={onboardingStyles.checkboxTick}>✓</Text>
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
            <View style={onboardingStyles.actionsRow}>
              <AppButton
                variant="secondary"
                label="Cancel"
                onPress={() => setEthnicityModalVisible(false)}
              />
              <AppButton
                variant="primary"
                label="Save"
                onPress={() => {
                  setValue("ethnicity", ethnicityDraft, {
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
  ethnicityGroup: {
    gap: 10,
  },
  ethnicityGroupTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  ethnicityModalContent: {
    gap: 16,
    paddingBottom: 8,
  },
  ethnicityOptionCentered: {
    alignItems: "center",
  },
  ethnicityOptionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text,
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
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.control,
  },
  phonePrefixText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  switchLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceMuted,
  },
});
