import { z } from "zod";
import { parseMedicalDetails, serializeMedicalDetails } from "@/lib/clinical/vitals";

const allergyStatusSchema = z.enum(["unknown", "none_known", "recorded"]);
const severitySchema = z.enum(["unknown", "mild", "moderate", "severe"]);
const conditionStatusSchema = z.enum(["active", "resolved"]);

export type AllergyStatus = z.infer<typeof allergyStatusSchema>;
export type AllergyItem = { substance: string; reaction: string; severity: z.infer<typeof severitySchema> };
export type ConditionItem = { name: string; status: z.infer<typeof conditionStatusSchema>; notes: string };
export type MedicalHistoryValues = {
  patientId: string;
  expectedVersion: number;
  allergies: { status: AllergyStatus; items: AllergyItem[] };
  conditions: { items: ConditionItem[] };
  medicalDetails: string;
};

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function isDuplicateCondition(name: string, existingNames: string[]): boolean {
  const cleanName = name.trim().toLowerCase();
  if (!cleanName) return false;
  return existingNames.some((existing) => existing.trim().toLowerCase() === cleanName);
}

export function parseMedicalHistoryForm(formData: FormData): MedicalHistoryValues {
  const patientId = z.string().uuid().parse(text(formData.get("patientId")));
  const expectedVersion = z.coerce.number().int().min(0).parse(text(formData.get("expectedVersion")));
  const allergyStatus = allergyStatusSchema.parse(text(formData.get("allergiesStatus")) || "unknown");
  const allergyLines = lines(text(formData.get("allergies")));
  const conditionLines = lines(text(formData.get("conditions")));
  if (allergyLines.length > 20 || conditionLines.length > 20) throw new Error("Enter at most 20 allergies and 20 conditions.");
  if (allergyStatus !== "recorded" && allergyLines.length > 0) throw new Error("Clear the allergy list or select “Allergies listed”.");
  if (allergyStatus === "recorded" && allergyLines.length === 0) throw new Error("List at least one allergy or choose a different allergy status.");

  const allergies = allergyLines.map((line) => {
    const [substance = "", reaction = "", severity = "unknown"] = line.split("|").map((part) => part.trim());
    if (!substance || substance.length > 120 || reaction.length > 240) throw new Error("Each allergy needs a substance and may include a reaction.");
    return { substance, reaction, severity: severitySchema.parse(severity.toLowerCase() || "unknown") };
  });
  const conditions = conditionLines.map((line) => {
    const [name = "", status = "active", notes = ""] = line.split("|").map((part) => part.trim());
    if (!name || name.length > 160 || notes.length > 500) throw new Error("Each condition needs a name and may include notes.");
    return { name, status: conditionStatusSchema.parse(status.toLowerCase() || "active"), notes };
  });

  const seenConditionNames = new Set<string>();
  for (const c of conditions) {
    const lower = c.name.toLowerCase();
    if (seenConditionNames.has(lower)) {
      throw new Error(`Condition "${c.name}" is already listed. Duplicate conditions are not allowed.`);
    }
    seenConditionNames.add(lower);
  }
  const suppliedDetails = z.string().max(6000).parse(text(formData.get("medicalDetails")));
  const parsedDetails = parseMedicalDetails(suppliedDetails);
  if (parsedDetails.notes.length > 2000) throw new Error("Additional medical notes must be 2,000 characters or fewer.");
  const medicalDetails = serializeMedicalDetails(parsedDetails.vitals, parsedDetails.notes, parsedDetails.healthProfile);
  if (medicalDetails.length > 6000) throw new Error("Health profile details are too long.");
  return {
    patientId,
    expectedVersion,
    allergies: { status: allergyStatus, items: allergies },
    conditions: { items: conditions },
    medicalDetails,
  };
}

export function parseVisitSummaryForm(formData: FormData) {
  return {
    appointmentId: z.string().uuid().parse(text(formData.get("appointmentId"))),
    expectedVersion: z.coerce.number().int().min(0).parse(text(formData.get("expectedVersion"))),
    summary: z.string().trim().min(1, "Enter a visit summary.").max(4000).parse(text(formData.get("summary"))),
    publish: z.enum(["true", "false"]).parse(text(formData.get("publish"))) === "true",
  };
}
