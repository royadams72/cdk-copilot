import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  Switch,
  Platform,
} from "react-native";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { zodResolver } from "@hookform/resolvers/zod";

import { PiiForm, type TPiiInput } from "@ckd/core";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import { API } from "@/constants/api";
import { useRouter } from "expo-router";

type SexAtBirth = TPiiInput["sexAtBirth"];
type Units = TPiiInput["units"];

export default function OnboardingPiiForm({
  defaults,
}: {
  defaults?: Partial<TPiiInput>;
}) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TPiiInput>({
    resolver: zodResolver(PiiForm) as unknown as Resolver<TPiiInput>,
    defaultValues: {
      phoneE164: null,
      firstName: "",
      lastName: "",
      dateOfBirth: null, // store as ISO string or null; convert for picker
      sexAtBirth: "unknown",
      genderIdentity: null,
      ethnicity: null,
      units: "metric",
      notificationPrefs: { email: true, push: true, sms: false },
      ...defaults,
    },
    mode: "onSubmit",
  });

  async function onSubmit(payload: TPiiInput) {
    try {
      setSaving(true);
      // If your API expects a Date, convert ISO->Date server-side.
      // Ensure dateOfBirth is ISO string or null.
      const body = JSON.stringify(payload);
      const res = await authFetch(`${API}/api/users/pii/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
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
    <View style={{ padding: 16, gap: 12 }}>
      {/* First name */}
      <Controller
        control={control}
        name="firstName"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Text>First name</Text>
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Jane"
              autoCapitalize="words"
              style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            />
            {!!errors.firstName && (
              <Text style={{ color: "red" }}>
                {String(errors.firstName.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Last name */}
      <Controller
        control={control}
        name="lastName"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Text>Last name</Text>
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Doe"
              autoCapitalize="words"
              style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            />
            {!!errors.lastName && (
              <Text style={{ color: "red" }}>
                {String(errors.lastName.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Phone (E.164) */}
      <Controller
        control={control}
        name="phoneE164"
        render={({ field: { onChange, value } }) => (
          <View>
            <Text>Phone (E.164)</Text>
            <TextInput
              value={value ?? ""}
              onChangeText={(t) => onChange(t.trim() === "" ? null : t.trim())}
              placeholder="+447911123456"
              keyboardType="phone-pad"
              autoCapitalize="none"
              style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            />
            {!!errors.phoneE164 && (
              <Text style={{ color: "red" }}>
                {String(errors.phoneE164.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Date of birth (ISO string in form state) */}
      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field: { onChange, value } }) => {
          const [show, setShow] = useState(false);
          const dateVal = value ? new Date(value) : null;

          return (
            <View>
              <Text>Date of birth</Text>
              <Text
                onPress={() => setShow(true)}
                style={{
                  borderWidth: 1,
                  padding: 10,
                  borderRadius: 8,
                  color: dateVal ? "black" : "#888",
                }}
              >
                {dateVal ? dateVal.toISOString().slice(0, 10) : "Tap to select"}
              </Text>
              {show && (
                <DateTimePicker
                  value={dateVal ?? new Date(2000, 0, 1)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, selected) => {
                    setShow(Platform.OS === "ios"); // keep open on iOS spinner
                    if (selected) {
                      // Persist as ISO date-only (midnight UTC) or full ISO; align with your API expectations
                      const iso = new Date(
                        Date.UTC(
                          selected.getFullYear(),
                          selected.getMonth(),
                          selected.getDate()
                        )
                      ).toISOString();
                      onChange(iso);
                    }
                  }}
                />
              )}
              {!!errors.dateOfBirth && (
                <Text style={{ color: "red" }}>
                  {String(errors.dateOfBirth.message)}
                </Text>
              )}
            </View>
          );
        }}
      />

      {/* Sex at birth */}
      <Controller
        control={control}
        name="sexAtBirth"
        render={({ field: { onChange, value } }) => (
          <View>
            <Text>Sex at birth</Text>
            <View style={{ borderWidth: 1, borderRadius: 8 }}>
              <Picker
                selectedValue={value as SexAtBirth}
                onValueChange={(v) => onChange(v as SexAtBirth)}
              >
                <Picker.Item label="female" value="female" />
                <Picker.Item label="male" value="male" />
                <Picker.Item label="intersex" value="intersex" />
                <Picker.Item label="unknown" value="unknown" />
              </Picker>
            </View>
            {!!errors.sexAtBirth && (
              <Text style={{ color: "red" }}>
                {String(errors.sexAtBirth.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Gender identity */}
      <Controller
        control={control}
        name="genderIdentity"
        render={({ field: { onChange, value } }) => (
          <View>
            <Text>Gender identity</Text>
            <TextInput
              value={value ?? ""}
              onChangeText={(t) => onChange(t.trim() === "" ? null : t)}
              style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            />
            {!!errors.genderIdentity && (
              <Text style={{ color: "red" }}>
                {String(errors.genderIdentity.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Ethnicity */}
      <Controller
        control={control}
        name="ethnicity"
        render={({ field: { onChange, value } }) => (
          <View>
            <Text>Ethnicity</Text>
            <TextInput
              value={value ?? ""}
              onChangeText={(t) => onChange(t.trim() === "" ? null : t)}
              style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            />
            {!!errors.ethnicity && (
              <Text style={{ color: "red" }}>
                {String(errors.ethnicity.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Units */}
      <Controller
        control={control}
        name="units"
        render={({ field: { onChange, value } }) => (
          <View>
            <Text>Units</Text>
            <View style={{ borderWidth: 1, borderRadius: 8 }}>
              <Picker
                selectedValue={value as Units}
                onValueChange={(v) => onChange(v as Units)}
              >
                <Picker.Item label="metric" value="metric" />
                <Picker.Item label="imperial" value="imperial" />
              </Picker>
            </View>
            {!!errors.units && (
              <Text style={{ color: "red" }}>
                {String(errors.units.message)}
              </Text>
            )}
          </View>
        )}
      />

      {/* Notifications */}
      <Text>Notifications</Text>

      <Controller
        control={control}
        name="notificationPrefs.email"
        render={({ field: { onChange, value } }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch value={!!value} onValueChange={onChange} />
            <Text>Email</Text>
          </View>
        )}
      />
      <Controller
        control={control}
        name="notificationPrefs.push"
        render={({ field: { onChange, value } }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch value={!!value} onValueChange={onChange} />
            <Text>Push</Text>
          </View>
        )}
      />
      <Controller
        control={control}
        name="notificationPrefs.sms"
        render={({ field: { onChange, value } }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch value={!!value} onValueChange={onChange} />
            <Text>SMS</Text>
          </View>
        )}
      />

      {!!errors.root && (
        <Text style={{ color: "red" }}>{String(errors.root.message)}</Text>
      )}

      <Button
        title={isSubmitting || saving ? "Saving…" : "Save"}
        disabled={isSubmitting || saving}
        onPress={handleSubmit(onSubmit)}
      />
    </View>
  );
}
