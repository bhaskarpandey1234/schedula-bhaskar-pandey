"use server";

import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments/provider";
import { createCheckoutPrefill } from "@/lib/payments/checkout";
import { randomUUID } from "node:crypto";

export type CheckoutSession = { appointmentId: string; paymentId: string; orderId: string; keyId: string; amountMinor: number; currency: string; expiresAt: string; prefill: { name: string; email: string; contact: string } };

export async function startCheckoutAction(input: { slotId: string; reason?: string; expectedAmountMinor?: number; idempotencyKey?: string }): Promise<CheckoutSession> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Please sign in before starting payment");
  const [{ data: profile, error: profileError }, { data: patient, error: patientError }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userData.user.id).maybeSingle(),
    supabase.from("patients").select("phone").eq("id", userData.user.id).maybeSingle(),
  ]);
  if (profileError || patientError) throw new Error("We could not load your profile. Please try again.");
  const prefill = createCheckoutPrefill({ name: profile?.full_name, email: userData.user.email, contact: patient?.phone });
  if (!prefill) throw new Error("Please update your name, email, and phone number in your profile before payment.");
  const { data, error } = await supabase.rpc("reserve_paid_appointment", { p_slot_id: input.slotId, p_reason: input.reason ?? null, p_idempotency_key: input.idempotencyKey ?? randomUUID(), p_expected_amount_minor: input.expectedAmountMinor ?? null });
  if (error) throw new Error(error.message);
  const reservation = (data as Array<{ appointment_id: string; payment_id: string; reservation_id: string; amount_minor: number; currency: string; expires_at: string }> | null)?.[0];
  if (!reservation) throw new Error("Could not reserve this appointment");
  const { data: appointment } = await supabase.from("appointments").select("doctor_id").eq("id", reservation.appointment_id).single();
  const { data: doctor } = appointment ? await supabase.from("doctors").select("clinic_name").eq("id", appointment.doctor_id).single() : { data: null };
  const { data: doctorProfile } = appointment ? await supabase.from("profiles").select("full_name").eq("id", appointment.doctor_id).single() : { data: null };
  const provider = getPaymentProvider();
  const order = await provider.createOrder({ amountMinor: reservation.amount_minor, currency: reservation.currency, receipt: reservation.payment_id, notes: { appointment_id: reservation.appointment_id, payment_id: reservation.payment_id, doctor_id: appointment?.doctor_id ?? "", doctor_name: doctorProfile?.full_name ?? "", clinic_name: doctor?.clinic_name ?? "" } });
  const { error: attachError } = await supabase.rpc("attach_payment_order", { p_payment_id: reservation.payment_id, p_order_id: order.id });
  if (attachError) throw new Error("Payment order could not be attached safely");
  return { appointmentId: reservation.appointment_id, paymentId: reservation.payment_id, orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID ?? "", amountMinor: order.amount, currency: order.currency, expiresAt: reservation.expires_at, prefill };
}

export async function verifyPaymentAction(input: { paymentId: string; orderId: string; providerPaymentId: string; signature: string }) {
  const supabase = await createClient();
  const { data: stored, error: storedError } = await supabase.from("payments").select("provider_order_id, amount_minor, currency").eq("id", input.paymentId).single();
  if (storedError || !stored?.provider_order_id) throw new Error("Payment order was not found");
  const provider = getPaymentProvider();
  if (input.orderId !== stored.provider_order_id || !provider.verifyCheckoutSignature({ orderId: stored.provider_order_id, paymentId: input.providerPaymentId, signature: input.signature })) throw new Error("Payment signature could not be verified");
  const payment = await provider.fetchPayment(input.providerPaymentId);
  if (payment.orderId !== stored.provider_order_id || payment.amount !== stored.amount_minor || payment.currency !== stored.currency || payment.status !== "captured") throw new Error("Payment is not captured yet");
  const { data, error } = await supabase.rpc("complete_payment", { p_payment_id: input.paymentId, p_provider_payment_id: input.providerPaymentId, p_outcome: "captured" });
  if (error) throw new Error(error.message);
  return { status: data as string };
}

export async function markPaymentAbandoned(input: { paymentId: string }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_payment", { p_payment_id: input.paymentId, p_provider_payment_id: null, p_outcome: "abandoned" });
  if (error) throw new Error(error.message);
}
