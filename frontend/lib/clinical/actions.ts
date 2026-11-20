"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile } from "@/lib/auth/guards";
import { getCurrentAccount } from "@/lib/auth/guards";
import { parseMedicalHistoryForm, parseVisitSummaryForm } from "@/lib/validation/medical-history";

export type ClinicalActionState = { error?: string; success?: boolean; prescriptionId?: string };
export type MedicalHistoryActionState = { error?: string; success?: string; version?: number; stale?: boolean };

export async function publishPrescriptionAction(_: ClinicalActionState, formData: FormData): Promise<ClinicalActionState> {
  await requireCompleteProfile("doctor");
  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  if (!appointmentId) return { error: "Appointment ID is required." };

  const itemsJson = formData.get("itemsJson");
  const diagnosis = String(formData.get("diagnosis") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  let items: Array<{ medication_name: string; dosage: string; frequency: string; duration: string; instructions?: string }> = [];

  if (typeof itemsJson === "string" && itemsJson.trim()) {
    try {
      const parsed = JSON.parse(itemsJson);
      if (Array.isArray(parsed)) {
        items = parsed
          .map((item) => ({
            medication_name: String(item.medicationName ?? item.medication_name ?? "").trim(),
            dosage: String(item.dosage ?? "").trim(),
            frequency: String(item.frequency ?? "").trim(),
            duration: String(item.duration ?? "").trim(),
            instructions: item.instructions ? String(item.instructions).trim() : undefined,
          }))
          .filter((item) => Boolean(item.medication_name && item.dosage && item.frequency && item.duration));
      }
    } catch {
      return { error: "Invalid medication items payload." };
    }
  }

  // Fallback to legacy single medication fields if itemsJson was not supplied
  if (items.length === 0) {
    const medName = String(formData.get("medicationName") ?? "").trim();
    const dosage = String(formData.get("dosage") ?? "").trim();
    const freq = String(formData.get("frequency") ?? "").trim();
    const dur = String(formData.get("duration") ?? "").trim();
    const inst = String(formData.get("instructions") ?? "").trim();

    if (medName && dosage && freq && dur) {
      items.push({
        medication_name: medName,
        dosage,
        frequency: freq,
        duration: dur,
        instructions: inst || undefined,
      });
    }
  }

  if (items.length === 0) {
    return { error: "At least one complete medication item (name, dosage, frequency, duration) is required." };
  }

  const supabase = await createClient();

  // Try v2 RPC with multi-item and consultation/completed support
  const { data: v2Data, error: v2Error } = await supabase.rpc("publish_doctor_prescription_v2", {
    p_appointment_id: appointmentId,
    p_items: items,
    p_notes: notes || null,
    p_diagnosis: diagnosis || null,
  });

  if (v2Error) {
    // If v2 function is missing in environment, fallback to v1 RPC
    if (items.length === 1) {
      const { error: v1Error } = await supabase.rpc("publish_doctor_prescription", {
        p_appointment_id: appointmentId,
        p_medication_name: items[0].medication_name,
        p_dosage: items[0].dosage,
        p_frequency: items[0].frequency,
        p_duration: items[0].duration,
        p_instructions: items[0].instructions ?? "",
        p_notes: [diagnosis ? `Diagnosis: ${diagnosis}` : "", notes].filter(Boolean).join("\n\n"),
      });
      if (v1Error) {
        return { error: `The prescription could not be published: ${v1Error.message || "Ensure the patient is in consultation or visit is completed."}` };
      }
    } else {
      return { error: `The prescription could not be published: ${v2Error.message || "Ensure the patient is in consultation or visit is completed."}` };
    }
  }

  revalidatePath(`/doctor/appointments/${appointmentId}`, "page");
  revalidatePath(`/doctor/queue/${appointmentId}/history`, "page");
  revalidatePath("/doctor/queue", "page");
  revalidatePath("/patient/history", "page");
  revalidatePath("/patient/appointments", "page");
  revalidatePath("/patient", "page");
  revalidatePath("/patient/assistant", "page");

  return { success: true, prescriptionId: v2Data as string };
}

function actionError(error: unknown, fallback: string): MedicalHistoryActionState {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("changed; refresh")) return { error: "This record changed while you were reviewing it. Refresh and review the latest version before saving.", stale: true };
  if (message.includes("access") || message.includes("treating doctor")) return { error: "You no longer have access to this clinical record. Return to the queue and refresh it.", stale: true };
  return { error: fallback };
}

export async function saveMedicalHistoryAction(_: MedicalHistoryActionState, formData: FormData): Promise<MedicalHistoryActionState> {
  const account = await getCurrentAccount();
  if (!account || !account.emailVerified || !account.profile || !account.onboardingComplete) return { error: "Your session expired. Sign in and refresh before saving.", stale: true };
  if (!["patient", "doctor"].includes(account.profile.role)) return { error: "Only patients and treating doctors can update medical history." };
  try {
    const values = parseMedicalHistoryForm(formData);
    if (account.profile.role === "patient" && values.patientId !== account.user.id) return { error: "You can update only your own medical history." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_patient_medical_history", {
      p_patient_id: values.patientId,
      p_expected_version: values.expectedVersion,
      p_allergies: values.allergies,
      p_conditions: values.conditions,
      p_medical_details: values.medicalDetails || null,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/patient/history");
    revalidatePath("/patient");
    revalidatePath("/doctor/queue");
    return { success: account.profile.role === "doctor" ? "Medical history saved as clinician verified." : "Medical history saved as self reported for clinician review.", version: Number(data) };
  } catch (error) {
    return actionError(error, "Medical history could not be saved. Check the details and try again.");
  }
}

export async function saveDoctorVisitSummaryAction(_: MedicalHistoryActionState, formData: FormData): Promise<MedicalHistoryActionState> {
  const account = await getCurrentAccount();
  if (!account || !account.emailVerified || account.profile?.role !== "doctor" || !account.onboardingComplete) return { error: "Doctor access is required to save a visit summary.", stale: true };
  try {
    const values = parseVisitSummaryForm(formData);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_doctor_visit_summary", {
      p_appointment_id: values.appointmentId,
      p_expected_version: values.expectedVersion,
      p_summary: values.summary,
      p_publish: values.publish,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/doctor/appointments/${values.appointmentId}`);
    revalidatePath("/doctor/queue");
    revalidatePath("/patient/history");
    return { success: values.publish ? "Visit summary published for the patient." : "Visit summary saved as a doctor-only draft.", version: Number(data) };
  } catch (error) {
    return actionError(error, "Visit summary could not be saved. Check the details and try again.");
  }
}
