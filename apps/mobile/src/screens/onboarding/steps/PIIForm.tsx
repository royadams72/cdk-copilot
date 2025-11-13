"use client";

import React, { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { authFetch } from "@/lib/authFetch";
import { Alert } from "react-native";
import { PiiForm, TPiiInput } from "@ckd/core";
import { API } from "@/constants/api";

// -----------------
// React form component
// -----------------
export default function OnboardingPiiForm({
  defaults,
}: {
  defaults?: Partial<TPiiInput>;
}) {
  const tzGuess =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TPiiInput>({
    resolver: zodResolver(PiiForm) as unknown as Resolver<TPiiInput>,
    defaultValues: {
      phoneE164: null,
      firstName: "",
      lastName: "",
      dateOfBirth: null,
      sexAtBirth: "unknown",
      genderIdentity: null,
      ethnicity: null,
      units: "metric",
      notificationPrefs: { email: true, push: true, sms: false },
      ...defaults,
    },
  });

  const [saving, setSaving] = useState(false);

  async function onSubmit(payload: any) {
    try {
      setSaving(true);
      const res = await authFetch(`${API}/api/users/pii/create`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`${res.status} ${JSON.stringify(err)}`);
      }
      Alert.alert("Saved");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <fieldset className="grid grid-cols-2 gap-3">
        <label className="col-span-1">
          <div>First name</div>
          <input className="input" {...register("firstName")} />
          {errors.firstName && (
            <p className="text-red-600 text-sm">{errors.firstName.message}</p>
          )}
        </label>
        <label className="col-span-1">
          <div>Last name</div>
          <input className="input" {...register("lastName")} />
          {errors.lastName && (
            <p className="text-red-600 text-sm">{errors.lastName.message}</p>
          )}
        </label>
      </fieldset>

      <label>
        <div>Phone (E.164)</div>
        <input
          className="input"
          placeholder="+447911123456"
          {...register("phoneE164")}
        />
        {errors.phoneE164 && (
          <p className="text-red-600 text-sm">
            {String(errors.phoneE164.message)}
          </p>
        )}
      </label>

      <label>
        <div>Date of birth</div>
        <input
          type="date"
          className="input"
          {...register("dateOfBirth", { setValueAs: (v) => v || null })}
        />
        {errors.dateOfBirth && (
          <p className="text-red-600 text-sm">
            {String(errors.dateOfBirth.message)}
          </p>
        )}
      </label>

      <label>
        <div>Sex at birth</div>
        <select className="input" {...register("sexAtBirth")}>
          <option value="female">female</option>
          <option value="male">male</option>
          <option value="intersex">intersex</option>
          <option value="unknown">unknown</option>
        </select>
      </label>

      <label>
        <div>Gender identity</div>
        <input className="input" {...register("genderIdentity")} />
      </label>

      <label>
        <div>Ethnicity</div>
        <input className="input" {...register("ethnicity")} />
      </label>

      <fieldset className="grid grid-cols-2 gap-3">
        <label>
          <div>Units</div>
          <select className="input" {...register("units")}>
            <option value="metric">metric</option>
            <option value="imperial">imperial</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="space-y-1">
        <div>Notifications</div>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("notificationPrefs.email")} />{" "}
          Email
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("notificationPrefs.push")} /> Push
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("notificationPrefs.sms")} /> SMS
        </label>
      </fieldset>

      {errors.root && (
        <p className="text-red-600 text-sm">{errors.root.message}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="px-4 py-2 rounded bg-black text-white"
      >
        {isSubmitting ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
