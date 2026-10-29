"use server";

import { bookingSchema } from "@/lib/validation/booking";
import { startCheckoutAction } from "@/lib/payments/actions";
import { formValues, firstZodError, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";

export type BookingActionState = FormActionState & { checkout?: Awaited<ReturnType<typeof startCheckoutAction>> };

export async function bookAppointmentAction(_: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const parsed = bookingSchema.safeParse({ slotId: formData.get("slotId"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { error: firstZodError(parsed.error) ?? "Check your booking details and try again.", fieldErrors: zodFieldErrors(parsed.error), values: formValues(formData) };
  try {
    const checkout = await startCheckoutAction({ slotId: parsed.data.slotId, reason: parsed.data.reason });
    return { checkout, values: formValues(formData) };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("already booked")) return { error: "You have already booked this slot.", values: formValues(formData) };
    if (message.includes("full") || message.includes("no longer available")) return { error: "This slot is no longer available. Please choose another time.", values: formValues(formData) };
    if (message.includes("onboarded") || message.includes("authenticated")) return { error: "Your patient session is no longer valid.", values: formValues(formData) };
    return { error: "We could not start payment for this appointment. Please try again.", values: formValues(formData) };
  }
}
