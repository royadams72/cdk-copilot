// db/models/users.clinical.model.ts
import { Schema, model, Types } from "mongoose";

const MedSchema = new Schema(
  {
    name: { type: String, required: true },
    dose: String,
    frequency: String,
    startedAt: Date,
    stoppedAt: Date,
  },
  { _id: false }
);

const CareTeamSchema = new Schema(
  {
    role: { type: String, required: true },
    name: String,
    org: String,
    contact: String,
  },
  { _id: false }
);

const UserClinicalSchema = new Schema(
  {
    orgId: { type: String, index: true },
    patientId: {
      type: Types.ObjectId,
      ref: "patients",
      required: true,
      index: true,
    },
    ckdStage: { type: String, enum: ["1", "2", "3a", "3b", "4", "5"] },
    egfrCurrent: Number,
    acrCategory: { type: String, enum: ["A1", "A2", "A3"] },
    dialysisStatus: {
      type: String,
      enum: ["none", "hemodialysis", "peritoneal", "post-transplant"],
      default: "none",
    },

    medications: { type: [MedSchema], default: [] },
    contraindications: { type: [String], default: [] },

    careTeam: { type: [CareTeamSchema], default: [] },

    lastClinicalUpdateAt: Date,
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

UserClinicalSchema.index({ orgId: 1, patientId: 1 }, { unique: true });
UserClinicalSchema.index({ orgId: 1, updatedAt: -1 });
UserClinicalSchema.index({ patientId: 1 });

export const UserClinicalModel = model("users_clinical", UserClinicalSchema);
