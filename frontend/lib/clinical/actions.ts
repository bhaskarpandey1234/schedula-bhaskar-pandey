"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile } from "@/lib/auth/guards";

export type ClinicalActionState = { error?: string; success?: boolean };

export async function completeDoctorAppointmentAction(_: ClinicalActionState, formData: FormData): Promise<ClinicalActionState> {
  await requireCompleteProfile("doctor");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_doctor_appointment", { p_appointment_id: appointmentId });
  if (error) return { error: "This appointment cannot be marked completed yet. Refresh and check its current status." };
  revalidatePath(`/doctor/appointments/${appointmentId}`, "page");
  revalidatePath("/doctor/appointments", "page");
  return { success: true };
}

export async function publishPrescriptionAction(_: ClinicalActionState, formData: FormData): Promise<ClinicalActionState> {
  await requireCompleteProfile("doctor");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const values = ["medicationName", "dosage", "frequency", "duration"].map((key) => String(formData.get(key) ?? "").trim());
  if (values.some((value) => !value)) return { error: "Medication, dosage, frequency, and duration are required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_doctor_prescription", { p_appointment_id: appointmentId, p_medication_name: values[0], p_dosage: values[1], p_frequency: values[2], p_duration: values[3], p_instructions: String(formData.get("instructions") ?? ""), p_notes: String(formData.get("notes") ?? "") });
  if (error) return { error: "The prescription could not be published. Verify that the appointment is completed." };
  revalidatePath(`/doctor/appointments/${appointmentId}`, "page");
  revalidatePath("/patient/assistant", "page");
  return { success: true };
}
