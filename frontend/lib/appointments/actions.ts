"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { appointmentIdSchema } from "@/lib/validation/appointments";

export type CancellationActionState = { error?: string; success?: boolean };

function firstIssue(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) return (error as { issues: Array<{ message: string }> }).issues[0]?.message;
  return undefined;
}

export async function cancelAppointmentAction(_: CancellationActionState, formData: FormData): Promise<CancellationActionState> {
  const parsed = appointmentIdSchema.safeParse({ appointmentId: formData.get("appointmentId") });
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the appointment and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_patient_appointment", { p_appointment_id: parsed.data.appointmentId });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found")) return { error: "This appointment is no longer available." };
    if (message.includes("already cancelled")) return { error: "This appointment is already cancelled." };
    if (message.includes("future")) return { error: "Only future appointments can be cancelled." };
    if (message.includes("onboarded") || message.includes("authenticated")) return { error: "Your patient session is no longer valid." };
    return { error: "We could not cancel this appointment. Please try again." };
  }
  revalidatePath("/patient/appointments", "page");
  revalidatePath("/patient", "page");
  revalidatePath("/doctor", "page");
  return { success: true };
}
