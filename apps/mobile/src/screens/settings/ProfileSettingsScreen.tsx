import { Picker } from "@react-native-picker/picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/app-screen";
import { ThemedText } from "@/components/themed-text";
import { formControlStyles, TextField } from "@/components/ui/form-field";
import { AppButton } from "@/components/ui/button";
import { theme } from "@/constants/theme";
import { Card } from "@/screens/dashboard/components/Card";
import {
  useGetCurrentUserSettingsQuery,
  useRequestEmailChangeMutation,
  useUpdateCurrentUserSettingsMutation,
} from "@/store/services/userApi";

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useGetCurrentUserSettingsQuery();
  const [updateProfile, { isLoading: isSaving }] =
    useUpdateCurrentUserSettingsMutation();
  const [requestEmailChange, { isLoading: isSendingEmail }] =
    useRequestEmailChangeMutation();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nhsNumber, setNhsNumber] = useState("");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [ckdStage, setCkdStage] = useState<
    "1" | "2" | "3a" | "3b" | "4" | "5" | null
  >(null);
  const [dialysisStatus, setDialysisStatus] = useState<
    "none" | "hemodialysis" | "peritoneal" | "post-transplant"
  >("none");
  const [height, setHeight] = useState("");
  const [heightFeet, setHeightFeet] = useState(5);
  const [heightInches, setHeightInches] = useState(6);

  useEffect(() => {
    if (!data) return;
    setEmail(data.email ?? "");
    setPhone(data.phoneE164 ?? "");
    setNhsNumber(data.nhsNumber ?? "");
    setUnits(data.units);
    setCkdStage(data.ckdStage ?? null);
    setDialysisStatus(data.dialysisStatus);
    setHeight(data.heightCm ? String(Math.round(data.heightCm)) : "");
    if (data.heightCm) {
      const totalInches = Math.round(data.heightCm / 2.54);
      setHeightFeet(Math.floor(totalInches / 12));
      setHeightInches(totalInches % 12);
    }
  }, [data]);

  function changeUnits(next: "metric" | "imperial") {
    if (next !== units && next === "imperial") {
      const totalInches = Math.round(Number(height) / 2.54);
      if (totalInches > 0) {
        setHeightFeet(Math.floor(totalInches / 12));
        setHeightInches(totalInches % 12);
      }
    } else if (next !== units) {
      setHeight(String(Math.round((heightFeet * 12 + heightInches) * 2.54)));
    }
    setUnits(next);
  }

  async function save() {
    const normalizedPhone = phone.trim() || null;
    const normalizedNhs = nhsNumber.replace(/\s/g, "") || null;
    const heightCm =
      units === "metric"
        ? Number(height)
        : (heightFeet * 12 + heightInches) * 2.54;
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()))
      return Alert.alert("Check email", "Enter a valid email address.");
    if (normalizedPhone && !/^\+?[1-9]\d{1,14}$/.test(normalizedPhone))
      return Alert.alert(
        "Check phone",
        "Use an international phone number, for example +447700900000.",
      );
    if (normalizedNhs && !/^\d{10}$/.test(normalizedNhs))
      return Alert.alert(
        "Check NHS number",
        "Enter the 10 digits without spaces.",
      );
    if (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 260)
      return Alert.alert("Check height", "Enter a valid height.");

    try {
      await updateProfile({
        ckdStage,
        dialysisStatus,
        heightCm,
        nhsNumber: normalizedNhs,
        phoneE164: normalizedPhone,
        units,
      }).unwrap();
      const normalizedEmail = email.trim().toLowerCase();
      const emailChanged =
        normalizedEmail !== (data?.email ?? "").trim().toLowerCase();
      if (emailChanged) {
        await requestEmailChange({ email: normalizedEmail }).unwrap();
      }
      await refetch();
      Alert.alert(
        emailChanged ? "Check your email" : "Profile saved",
        emailChanged
          ? `We sent a verification link to ${normalizedEmail}. Your current email stays active until you confirm it.`
          : "Your profile details have been updated.",
      );
    } catch (error: any) {
      Alert.alert(
        "Could not save profile",
        error?.data?.message ?? "Please try again.",
      );
    }
  }

  if (isLoading || !data) {
    return (
      <AppScreen>
        <ActivityIndicator size="large" />
        <ThemedText>Loading profile...</ThemedText>
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboardAware contentContainerStyle={{ gap: theme.spacing.lg }}>
      <View style={styles.header}>
        <AppButton
          label="Back"
          onPress={() => router.back()}
          size="compact"
          variant="outline"
        />
      </View>
      <View style={{ gap: 4 }}>
        <ThemedText type="title">Your profile</ThemedText>
        <ThemedText style={styles.intro}>
          Keep your contact preferences and core kidney-health details up to
          date.
        </ThemedText>
      </View>

      <Card style={styles.card}>
        <ThemedText type="defaultSemiBold">Personal details</ThemedText>
        <TextField
          description="Changing this sends a verification link. Your current email remains active until confirmed."
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextField
          label="NHS number (optional)"
          value={nhsNumber}
          onChangeText={setNhsNumber}
          keyboardType="number-pad"
          maxLength={12}
        />
        <PickerField
          label="Units"
          selectedValue={units}
          onValueChange={changeUnits}
          items={[
            { label: "Metric (kg, cm)", value: "metric" },
            { label: "Imperial (lb, ft)", value: "imperial" },
          ]}
        />
      </Card>

      <Card style={styles.card}>
        <ThemedText type="defaultSemiBold">Kidney health</ThemedText>
        <PickerField
          label="CKD stage"
          selectedValue={ckdStage ?? ""}
          onValueChange={(value) =>
            setCkdStage(value ? (value as typeof ckdStage) : null)
          }
          items={[
            { label: "Not set", value: "" },
            ...["1", "2", "3a", "3b", "4", "5"].map((value) => ({
              label: `Stage ${value}`,
              value,
            })),
          ]}
        />
        <PickerField
          label="Dialysis status"
          selectedValue={dialysisStatus}
          onValueChange={setDialysisStatus}
          items={[
            { label: "Not on dialysis", value: "none" },
            { label: "Haemodialysis", value: "hemodialysis" },
            { label: "Peritoneal dialysis", value: "peritoneal" },
            { label: "Post-transplant", value: "post-transplant" },
          ]}
        />
        {units === "metric" ? (
          <TextField
            label="Height (cm)"
            value={height}
            onChangeText={setHeight}
            keyboardType="number-pad"
          />
        ) : (
          <View style={styles.heightRow}>
            <View style={styles.heightPicker}>
              <PickerField
                label="Height (feet)"
                selectedValue={heightFeet}
                onValueChange={setHeightFeet}
                items={Array.from({ length: 6 }, (_, index) => ({
                  label: `${index + 3} ft`,
                  value: index + 3,
                }))}
              />
            </View>
            <View style={styles.heightPicker}>
              <PickerField
                label="Height (inches)"
                selectedValue={heightInches}
                onValueChange={setHeightInches}
                items={Array.from({ length: 12 }, (_, value) => ({
                  label: `${value} in`,
                  value,
                }))}
              />
            </View>
          </View>
        )}
      </Card>

      <Card style={styles.card}>
        <ThemedText type="defaultSemiBold">Care team</ThemedText>
        <ThemedText style={styles.readOnly}>
          Managed by your renal service and shown here as read-only.
        </ThemedText>
        {data.careTeam.length ? (
          data.careTeam.map((member, index) => (
            <View key={`${member.role}-${index}`} style={styles.member}>
              <ThemedText type="defaultSemiBold">
                {member.name || member.role}
              </ThemedText>
              <ThemedText style={styles.readOnly}>
                {[member.name ? member.role : null, member.org, member.contact]
                  .filter(Boolean)
                  .join(" · ")}
              </ThemedText>
            </View>
          ))
        ) : (
          <ThemedText style={styles.readOnly}>
            No care-team details have been added yet.
          </ThemedText>
        )}
      </Card>

      <TouchableOpacity
        disabled={isSaving || isSendingEmail}
        onPress={() => void save()}
        style={[styles.save, (isSaving || isSendingEmail) && { opacity: 0.6 }]}
      >
        <ThemedText style={styles.saveText}>
          {isSaving || isSendingEmail ? "Saving..." : "Save profile"}
        </ThemedText>
      </TouchableOpacity>
    </AppScreen>
  );
}

function PickerField({
  items,
  label,
  onValueChange,
  selectedValue,
}: {
  items: { label: string; value: any }[];
  label: string;
  onValueChange: (value: any) => void;
  selectedValue: any;
}) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={formControlStyles.shell}>
        <Picker selectedValue={selectedValue} onValueChange={onValueChange}>
          {items.map((item) => (
            <Picker.Item key={String(item.value)} {...item} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.lg },
  header: { alignItems: "flex-start" },
  heightPicker: { flex: 1 },
  heightRow: { flexDirection: "row", gap: theme.spacing.md },
  intro: { opacity: 0.72 },
  label: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  member: {
    borderTopColor: theme.colors.borderSubtle,
    borderTopWidth: 1,
    gap: 2,
    paddingTop: theme.spacing.md,
  },
  readOnly: { color: theme.colors.textSecondary },
  save: {
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    minHeight: theme.controls.height,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  saveText: { color: theme.colors.onPrimary, fontWeight: "700" },
});
