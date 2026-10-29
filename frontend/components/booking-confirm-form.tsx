"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bookAppointmentAction, type BookingActionState } from "@/lib/booking/actions";
import { verifyPaymentAction, markPaymentAbandoned } from "@/lib/payments/actions";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void }; } }

export function BookingConfirmForm({ slotId, reason, backHref, amountMinor, currency }: { slotId: string; reason: string; backHref: string; amountMinor?: number | null; currency?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(bookAppointmentAction, {} as BookingActionState);
  const [currentReason, setCurrentReason] = useState(reason);
  const [paymentError, setPaymentError] = useState<string>();
  useEffect(() => { setCurrentReason(sessionStorage.getItem(`schedula:booking-reason:${slotId}`) ?? reason); }, [slotId, reason]);
  useEffect(() => {
    const checkout = state.checkout;
    if (!checkout) return;
    const openCheckout = () => {
      if (!window.Razorpay) { setPaymentError("Payment checkout could not load. Please try again."); return; }
      const instance = new window.Razorpay({ key: checkout.keyId, amount: checkout.amountMinor, currency: checkout.currency, order_id: checkout.orderId, name: "Schedula Healthcare", description: "Online consultation", handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try { await verifyPaymentAction({ paymentId: checkout.paymentId, orderId: response.razorpay_order_id, providerPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature }); router.push(`/patient/appointments/${checkout.appointmentId}/confirmation`); } catch (error) { setPaymentError(error instanceof Error ? error.message : "Payment could not be verified yet."); }
      }, modal: { ondismiss: () => { void markPaymentAbandoned({ paymentId: checkout.paymentId }); } } });
      instance.open();
    };
    if (window.Razorpay) openCheckout(); else { const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = openCheckout; script.onerror = () => setPaymentError("Payment checkout could not load. Please try again."); document.body.appendChild(script); }
  }, [state.checkout, router]);
  const displayAmount = amountMinor == null ? null : new Intl.NumberFormat("en-IN", { style: "currency", currency: currency ?? "INR" }).format(amountMinor / 100);
  return <form action={action} noValidate className="grid gap-3"><input type="hidden" name="slotId" value={slotId} /><input type="hidden" name="reason" value={currentReason} />{currentReason && <p className="rounded-md bg-muted p-3 text-sm">Visit reason: {currentReason}</p>}{displayAmount && <p className="rounded-md border p-3 text-sm">Consultation fee: <strong>{displayAmount}</strong></p>}<FormErrorSummary error={state.error ?? paymentError} /><div className="flex flex-wrap gap-3"><Button asChild type="button" variant="outline"><Link href={backHref}>Edit reason</Link></Button><Button type="submit" disabled={pending || Boolean(state.checkout)}>{pending ? "Preparing payment…" : "Pay & confirm"}</Button></div></form>;
}
