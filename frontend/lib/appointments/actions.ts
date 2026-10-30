"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { appointmentIdSchema } from "@/lib/validation/appointments";
import { formValues, firstZodError, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";
import { requireVerifiedUser } from "@/lib/auth/guards";

export type CancellationActionState = FormActionState;

export async function cancelDoctorAppointmentAction(_: CancellationActionState, formData: FormData): Promise<CancellationActionState> {
  const parsed = appointmentIdSchema.safeParse({ appointmentId: formData.get("appointmentId") });
  if (!parsed.success) return { error: firstZodError(parsed.error) ?? "Check the appointment and try again.", fieldErrors: zodFieldErrors(parsed.error), values: formValues(formData) };
  try { await requireVerifiedUser(); } catch (error) { if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return { error: "Verify your email before managing appointments.", values: formValues(formData) }; throw error; }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_doctor_appointment", { p_appointment_id: parsed.data.appointmentId });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found")) return { error: "This appointment is no longer available.", values: formValues(formData) };
    if (message.includes("future")) return { error: "Only future appointments can be cancelled.", values: formValues(formData) };
    return { error: "Could not cancel the appointment. Please try again.", values: formValues(formData) };
  }
  revalidatePath("/doctor/appointments", "page");
  revalidatePath("/doctor", "page");
  return { success: true, values: formValues(formData) };
}

export async function cancelAppointmentAction(_: CancellationActionState, formData: FormData): Promise<CancellationActionState> {
  const parsed = appointmentIdSchema.safeParse({ appointmentId: formData.get("appointmentId") });
  if (!parsed.success) return { error: firstZodError(parsed.error) ?? "Check the appointment and try again.", fieldErrors: zodFieldErrors(parsed.error), values: formValues(formData) };
  try { await requireVerifiedUser(); } catch (error) { if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return { error: "Verify your email before managing appointments.", values: formValues(formData) }; throw error; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_paid_appointment", { p_appointment_id: parsed.data.appointmentId });
  if (error) {
    const message = error.message.toLowerCase();
    console.error("Appointment cancellation failed", { name: error.name, code: error.code ?? null, category: message.includes("refund") ? "refund" : message.includes("future") ? "eligibility" : "database" });
    if (message.includes("not found")) return { error: "This appointment is no longer available.", values: formValues(formData) };
    if (message.includes("already cancelled")) return { error: "This appointment is already cancelled.", values: formValues(formData) };
    if (message.includes("future")) return { error: "Only future appointments can be cancelled.", values: formValues(formData) };
    if (message.includes("onboarded") || message.includes("authenticated")) return { error: "Your patient session is no longer valid.", values: formValues(formData) };
    return { error: "We could not complete the cancellation right now. Your appointment has not been changed; please try again.", values: formValues(formData) };
  }
  revalidatePath("/patient/appointments", "page");
  revalidatePath("/patient", "page");
  revalidatePath("/patient/payments", "page");
  revalidatePath("/doctor", "page");
  const result = (data ?? {}) as { refund_amount_minor?: number };
  return { success: true, values: { refundAmountMinor: String(result.refund_amount_minor ?? 0) } };
}

export async function cancelDoctorSessionOccurrenceAction(_: CancellationActionState, formData: FormData): Promise<CancellationActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const occurrenceDate = String(formData.get("occurrenceDate") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { error: "Choose a valid future session date." };
  try { await requireVerifiedUser(); } catch (error) { if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return { error: "Verify your email before managing appointments.", values: formValues(formData) }; throw error; }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_doctor_session_occurrence", { p_session_id: sessionId, p_occurrence_date: occurrenceDate });
  if (error) return { error: error.message.includes("future") ? "Leave must be scheduled for a future date." : "We could not cancel this session. Please try again." };
  revalidatePath("/doctor/schedule", "page");
  revalidatePath("/doctor/appointments", "page");
  revalidatePath("/doctor/notifications", "page");
  return { success: true };
}
