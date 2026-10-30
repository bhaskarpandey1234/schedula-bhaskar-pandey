"use server";

import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function startRescheduleAction(input: { appointmentId: string; targetSlotId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_same_doctor_reschedule", { p_appointment_id: input.appointmentId, p_target_slot_id: input.targetSlotId });
  if (error) throw new Error(error.message);
  const result = (data as Array<{ reschedule_id: string; payment_id: string | null; amount_minor: number; currency: string; expires_at: string; status: string }> | null)?.[0];
  if (!result) throw new Error("Could not start rescheduling");
  if (result.status === "completed" || !result.payment_id) return result;
  const order = await getPaymentProvider().createOrder({ amountMinor: result.amount_minor, currency: result.currency, receipt: result.payment_id });
  const { error: attachError } = await supabase.rpc("attach_payment_order", { p_payment_id: result.payment_id, p_order_id: order.id });
  if (attachError) throw new Error("Reschedule payment could not be attached");
  return { ...result, orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID ?? "" };
}
