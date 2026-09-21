import type { TPiiFormInput } from "@ckd/core";
import { GenderIdentitySameAsBirth, SexAtBirth } from "../definitions/pii";

export function inferGenderIdentitySameAsBirth(
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

export function buildGenderIdentityValue(
  sexAtBirth: SexAtBirth,
  sameAsBirth: GenderIdentitySameAsBirth,
  selectedIdentity: string | null,
) {
  if (sameAsBirth === "yes") return sexAtBirth;
  if (sameAsBirth === "no") return selectedIdentity;
  return sameAsBirth;
}

export function formatPhoneForDisplay(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith("+44")) return value.slice(3);
  return value.replace(/^\+/, "");
}

export function normalizeUkPhoneInput(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

export function toUkPhoneE164(input: string) {
  const digits = normalizeUkPhoneInput(input);
  if (!digits) return null;
  return `+44${digits}`;
}

export function normalizePiiFormValues(
  value: Partial<TPiiFormInput>,
): Partial<TPiiFormInput> {
  return {
    ...value,
    dateOfBirth: value.dateOfBirth ?? null,
    nhsNumber: value.nhsNumber?.replace(/\s+/g, "") ?? null,
  };
}
