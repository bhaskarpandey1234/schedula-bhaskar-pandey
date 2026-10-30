import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Receipt, ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getPatientPayments } from "@/lib/payments/queries";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/payment-status";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { isUuid } from "@/lib/discovery/directory";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintButton } from "@/components/print-button";

export const instant = false;

export default async function PatientPaymentDetailPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const { paymentId } = await params;
  if (!isUuid(paymentId)) notFound();
  const payment = (await getPatientPayments(paymentId))[0];
  if (!payment) notFound();
  return <PortalShell role="patient" name={account.profile.full_name}><div className="mx-auto grid max-w-2xl gap-6"><Link href="/patient/payments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to payments</Link><div className="flex items-center gap-3"><Receipt className="size-7 text-primary" /><div><p className="text-sm font-medium text-primary">Payment acknowledgement</p><h1 className="text-3xl font-semibold tracking-tight">{payment.doctor_name}</h1></div></div><Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>{payment.currency} {(payment.amount_minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</CardTitle><CardDescription>{formatLocalSlotRange(payment.slot_start_at, payment.slot_end_at, payment.timezone)}</CardDescription></div><PaymentStatusBadge status={payment.payment_status} /></CardHeader><CardContent className="grid gap-3 text-sm"><p><span className="text-muted-foreground">Clinic:</span> {payment.clinic_name}</p><p><span className="text-muted-foreground">Payment created:</span> {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: payment.timezone }).format(new Date(payment.created_at))}</p>{payment.captured_at && <p><span className="text-muted-foreground">Paid on:</span> {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: payment.timezone }).format(new Date(payment.captured_at))}</p>}<p><span className="text-muted-foreground">Payment reference:</span> {payment.provider_payment_id ?? "Awaiting payment"}</p><p><span className="text-muted-foreground">Order reference:</span> {payment.provider_order_id ?? "Awaiting payment"}</p>{payment.refund_status && <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Refund {payment.currency} {(payment.refund_amount_minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span><RefundStatusBadge status={payment.refund_status} /></div>}{payment.failure_reason && <p className="text-destructive">{payment.failure_reason}</p>}</CardContent></Card><p className="text-xs text-muted-foreground">This is a Schedula payment acknowledgement, not a GST tax invoice.</p><PrintButton /></div></PortalShell>;
}
