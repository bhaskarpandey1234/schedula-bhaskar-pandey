"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bookAppointmentAction, type BookingActionState } from "@/lib/booking/actions";
import { verifyPaymentAction, markPaymentAbandoned } from "@/lib/payments/actions";
import { presentPaymentError } from "@/lib/payments/errors";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";
import { useFeedback } from "@/components/ui/feedback";

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (event: string, handler: (response: { error?: { description?: string; reason?: string } }) => void) => void }; } }

export function BookingConfirmForm({ slotId, reason, backHref, amountMinor, currency }: { slotId: string; reason: string; backHref: string; amountMinor?: number | null; currency?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(bookAppointmentAction, {} as BookingActionState);
  const [currentReason, setCurrentReason] = useState(reason);
  const [paymentError, setPaymentError] = useState<string>();
  const { notify } = useFeedback();
  useEffect(() => { setCurrentReason(sessionStorage.getItem(`schedula:booking-reason:${slotId}`) ?? reason); }, [slotId, reason]);
  useEffect(() => {
    if (state.error) notify({ type: "error", title: "Booking could not continue", description: state.error });
  }, [state.error, notify]);
  useEffect(() => {
    const checkout = state.checkout;
    if (!checkout) return;
    const openCheckout = () => {
      if (!window.Razorpay) { setPaymentError("Payment checkout could not load. Please try again."); return; }
      let paymentCompleted = false;
      const instance = new window.Razorpay({ key: checkout.keyId, amount: checkout.amountMinor, currency: checkout.currency, order_id: checkout.orderId, name: "Schedula Healthcare", description: "Online consultation", prefill: checkout.prefill, handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try { paymentCompleted = true; await verifyPaymentAction({ paymentId: checkout.paymentId, orderId: response.razorpay_order_id, providerPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature }); notify({ type: "success", title: "Appointment confirmed", description: "Your appointment is ready in My Appointments." }); router.push(`/patient/appointments/${checkout.appointmentId}/confirmation`); } catch (error) { const message = presentPaymentError(error); setPaymentError(message); notify({ type: "error", title: "Payment verification failed", description: message }); }
      }, modal: { ondismiss: () => { if (!paymentCompleted) void markPaymentAbandoned({ paymentId: checkout.paymentId }).catch(() => undefined); } } });
      instance.on?.("payment.failed", (response) => { setPaymentError(response.error?.description ?? response.error?.reason ?? "Payment failed. You can retry while the slot is held."); });
      instance.open();
    };
    if (window.Razorpay) openCheckout(); else { const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = openCheckout; script.onerror = () => setPaymentError("Payment checkout could not load. Please try again."); document.body.appendChild(script); }
  }, [state.checkout, router, notify]);
  const displayAmount = amountMinor == null ? null : new Intl.NumberFormat("en-IN", { style: "currency", currency: currency ?? "INR" }).format(amountMinor / 100);
  return <form action={action} noValidate className="grid gap-3"><input type="hidden" name="slotId" value={slotId} /><input type="hidden" name="reason" value={currentReason} /><input type="hidden" name="expectedAmountMinor" value={amountMinor ?? ""} />{currentReason && <p className="rounded-md bg-muted p-3 text-sm">Visit reason: {currentReason}</p>}{displayAmount && <p className="rounded-md border p-3 text-sm">Consultation fee: <strong>{displayAmount}</strong></p>}<FormErrorSummary error={state.error ?? paymentError} /><div className="flex flex-wrap gap-3"><Button asChild type="button" variant="outline"><Link href={backHref}>Edit reason</Link></Button><Button type="submit" disabled={pending || Boolean(state.checkout)}>{pending ? "Preparing payment…" : "Pay & confirm"}</Button></div></form>;
}
