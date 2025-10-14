// db/models/users.pii.model.ts
import { Schema, model, models } from "mongoose";
import { connectMongo } from "./db/connect";
const DeviceSchema = new Schema(
  {
    platform: { type: String, enum: ["ios", "android", "web"], required: true },
    pushToken: String,
    lastSeenAt: Date,
  },
  { _id: false }
);

const IntegrationsSchema = new Schema(
  {
    appleHealth: { linked: Boolean, lastSyncAt: Date },
    googleFit: { linked: Boolean, lastSyncAt: Date },
    withings: { linked: Boolean, lastSyncAt: Date },
  },
  { _id: false }
);

const UserPIISchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    emailVerifiedAt: Date,
    passwordHash: String,
    authProvider: {
      type: String,
      enum: ["password", "google", "apple", "auth0", "github"],
      required: true,
    },
    authProviderId: { type: String, index: true },
    phoneE164: { type: String, index: true },

    firstName: String,
    lastName: String,
    dateOfBirth: Date,
    sexAtBirth: {
      type: String,
      enum: ["female", "male", "intersex", "unknown"],
    },
    genderIdentity: String,
    ethnicity: String,

    country: { type: String, required: true, default: "GB" },
    timeZone: { type: String, required: true, default: "Europe/London" },
    units: { type: String, enum: ["metric", "imperial"], default: "metric" },
    language: { type: String, default: "en-GB" },

    onboardingCompleted: { type: Boolean, default: false },
    onboardingSteps: { type: [String], default: [] },

    notificationPrefs: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },

    integrations: { type: IntegrationsSchema, default: {} },
    devices: { type: [DeviceSchema], default: [] },

    consentAppTosAt: { type: Date, required: true },
    consentPrivacyAt: { type: Date, required: true },
    consentResearchAt: Date,
    pseudonymId: { type: String, required: true, unique: true, index: true },
    dataSharingScope: {
      type: String,
      enum: ["minimal", "standard", "broad"],
      default: "standard",
    },

    lastActiveAt: Date,
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

UserPIISchema.index({ authProvider: 1, authProviderId: 1 }, { sparse: true });
UserPIISchema.index({ email: 1 }, { unique: true });

export async function UsersPiiModel() {
  await connectMongo();
  return models.UsersPii || model("UsersPii", UserPIISchema, "users_pii");
}
