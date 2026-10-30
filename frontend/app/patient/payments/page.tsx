import Link from "next/link";
import { connection } from "next/server";
import { CreditCard, Receipt } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getPatientPayments } from "@/lib/payments/queries";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/payment-status";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";

export const instant = false;

export default async function PatientPaymentsPage() {
  await connection();
  const account = await requireRole("patient");
  const payments = await getPatientPayments();
  return <PortalShell role="patient" name={account.profile.full_name}><div className="grid gap-6"><div><p className="text-sm font-medium text-primary">Payments</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Payments & receipts</h1><p className="mt-2 text-muted-foreground">Review your consultation charges, payment attempts, and refunds.</p></div>{payments.length === 0 ? <EmptyState title="No payment records yet" description="Completed or attempted appointment payments will appear here." /> : <div className="grid gap-4 lg:grid-cols-2">{payments.map((payment) => <Card key={payment.payment_id}><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="text-base flex items-center gap-2"><CreditCard className="size-4 text-primary" />{payment.doctor_name}</CardTitle><CardDescription>{formatLocalSlotRange(payment.slot_start_at, payment.slot_end_at, payment.timezone)}</CardDescription></div><PaymentStatusBadge status={payment.payment_status} /></CardHeader><CardContent className="grid gap-3 text-sm"><p className="font-medium">{payment.currency} {(payment.amount_minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p><p className="text-muted-foreground">Created {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: payment.timezone }).format(new Date(payment.created_at))}</p>{payment.refund_status && <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Refund {payment.currency} {(payment.refund_amount_minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span><RefundStatusBadge status={payment.refund_status} /></div>}<Link className="inline-flex items-center gap-2 text-primary font-medium hover:underline" href={`/patient/payments/${payment.payment_id}`}><Receipt className="size-4" />View payment acknowledgement</Link></CardContent></Card>)}</div>}</div></PortalShell>;
}
