import { z } from "zod";
import { objectIdHex, PrincipalId } from "./common";

export const MedicationStatus = z.enum([
  "active",
  "paused",
  "stopped",
  "completed",
]);
export const MedicationSource = z.enum(["manual", "import", "integration"]);

export const MedicationLedger_Base = z
  .object({
    _id: objectIdHex, // PK
    orgId: z.string().min(1),
    patientId: objectIdHex, // ref: patients
    drugRefId: objectIdHex.optional(), // ref: drugs_ref (preferred)
    dmplusdCode: z.string().min(1).optional(), // NHS dm+d code
    snomedCode: z.string().min(1).optional(),
    name: z.string().min(1), // denormalised label
    form: z.string().min(1).optional(), // tablet, solution, etc.
    strength: z.string().min(1).optional(), // e.g., "10 mg"
    route: z.string().min(1).optional(), // oral, IV, etc.
    dose: z.string().min(1), // free text or structured
    frequency: z.string().min(1), // e.g., "once daily"
    instructions: z.string().min(1).optional(),
    startAt: z.date().nullable(),
    endAt: z.date().optional().nullable(),
    status: MedicationStatus,
    source: MedicationSource.default("manual"),
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: PrincipalId,
    updatedBy: PrincipalId,
  })
  // Ensure endAt is not before startAt
  .refine((d) => !d.endAt || d.endAt >= d.startAt!, {
    message: "endAt must be on/after startAt",
    path: ["endAt"],
  })
  // If status is stopped/completed, prefer having an endAt
  .refine((d) => !["stopped", "completed"].includes(d.status) || !!d.endAt, {
    message: "endAt is recommended when status is stopped/completed",
    path: ["endAt"],
  });

export const MedicationLedger_Create = MedicationLedger_Base.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).extend({
  // keep default for source at create-time
  source: MedicationSource.default("manual"),
});

export const MedicationLedger_Update = z
  .object({
    // immutable identifiers excluded; patchable fields only
    drugRefId: objectIdHex.optional(),
    dmplusdCode: z.string().min(1).optional(),
    snomedCode: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    form: z.string().min(1).optional(),
    strength: z.string().min(1).optional(),
    route: z.string().min(1).optional(),
    dose: z.string().min(1).optional(),
    frequency: z.string().min(1).optional(),
    instructions: z.string().min(1).optional(),
    startAt: z.date().optional(),
    endAt: z.date().optional(),
    status: MedicationStatus.optional(),
    source: MedicationSource.optional(),
  })
  .refine(
    // if both provided, enforce start/end order
    (p) => !(p.startAt && p.endAt) || p.endAt >= p.startAt,
    { message: "endAt must be on/after startAt", path: ["endAt"] }
  );

export const MedicationFormEntry = MedicationLedger_Base.pick({
  name: true,
  form: true,
  strength: true,
  route: true,
  dose: true,
  frequency: true,
  instructions: true,
  startAt: true,
  endAt: true,
  status: true,
  source: true,
  dmplusdCode: true,
  snomedCode: true,
});

export const MedicationsFormSchema = z.object({
  medications: z
    .array(MedicationFormEntry)
    .min(1, "Add at least one medication record"),
});

export type TMedicationFormValues = z.infer<typeof MedicationsFormSchema>;
