"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bookingSchema } from "@/lib/validation/booking";
import { getAppointmentConfirmation } from "@/lib/booking/queries";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { formValues, firstZodError, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";

export type BookingActionState = FormActionState;

export async function bookAppointmentAction(_: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const parsed = bookingSchema.safeParse({ slotId: formData.get("slotId"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { error: firstZodError(parsed.error) ?? "Check your booking details and try again.", fieldErrors: zodFieldErrors(parsed.error), values: formValues(formData) };
  const supabase = await createClient();
  const { data: appointmentId, error } = await supabase.rpc("book_appointment", {
    p_slot_id: parsed.data.slotId,
    p_reason: parsed.data.reason || null,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already booked")) return { error: "You have already booked this slot.", values: formValues(formData) };
    if (message.includes("full") || message.includes("no longer available")) return { error: "This slot is no longer available. Please choose another time.", values: formValues(formData) };
    if (message.includes("onboarded") || message.includes("authenticated")) return { error: "Your patient session is no longer valid.", values: formValues(formData) };
    return { error: "We could not confirm this appointment. Please try again.", values: formValues(formData) };
  }
  if (!appointmentId) return { error: "We could not confirm this appointment. Please try again.", values: formValues(formData) };
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.email) {
    try {
      const confirmation = await getAppointmentConfirmation(appointmentId);
      if (confirmation) await sendBookingConfirmationEmail({ to: userData.user.email, doctorName: confirmation.doctor.full_name, clinicName: confirmation.doctor.clinic_name, timezone: confirmation.doctor.timezone, slotStartAt: confirmation.slot.slot_start_at, slotEndAt: confirmation.slot.slot_end_at, reason: confirmation.appointment.reason });
    } catch {
      // Email delivery is best-effort and must not invalidate a booked appointment.
    }
  }
  revalidatePath("/patient/doctors", "page");
  revalidatePath("/patient", "page");
  revalidatePath("/patient/appointments", "page");
  revalidatePath("/doctor", "page");
  redirect(`/patient/appointments/${appointmentId}/confirmation`);
}
