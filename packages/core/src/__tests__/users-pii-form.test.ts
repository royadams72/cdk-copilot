import { PiiForm } from "../isomorphic/schemas/users_pii";

const validInput = {
  dateOfBirth: "1990-05-21T00:00:00.000Z",
  ethnicity: "white_british",
  firstName: "Alex",
  genderIdentity: "unknown",
  lastName: "Patient",
  nhsNumber: "1234567890",
  notificationPrefs: { email: true, push: true, sms: false },
  phoneE164: "+447911123456",
  sexAtBirth: "unknown",
  units: "metric",
} as const;

describe("PiiForm", () => {
  it("accepts string form input and returns a Date after validation", () => {
    const parsed = PiiForm.parse(validInput);

    expect(parsed.dateOfBirth).toBeInstanceOf(Date);
    expect(parsed.dateOfBirth?.toISOString()).toBe(validInput.dateOfBirth);
    expect(parsed.units).toBe("metric");
  });

  it("rejects an invalid date string", () => {
    expect(() =>
      PiiForm.parse({ ...validInput, dateOfBirth: "not-a-date" }),
    ).toThrow();
  });
});
