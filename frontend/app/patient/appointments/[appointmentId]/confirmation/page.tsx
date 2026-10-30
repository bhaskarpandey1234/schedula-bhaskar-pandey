import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  MapPin,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getAppointmentConfirmation } from "@/lib/booking/queries";
import { getPatientPayments } from "@/lib/payments/queries";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/payment-status";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { isUuid } from "@/lib/discovery/directory";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function AppointmentConfirmationPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  await connection();
  const account = await requireRole("patient");
  const { appointmentId } = await params;
  if (!isUuid(appointmentId)) notFound();
  const [confirmation, payments] = await Promise.all([
    getAppointmentConfirmation(appointmentId),
    getPatientPayments(),
  ]);
  if (!confirmation) notFound();
  const { appointment, doctor, slot, notification } = confirmation;
  const payment = payments.find((item) => item.appointment_id === appointmentId);
  const title =
    appointment.status === "confirmed"
      ? "Your appointment is confirmed."
      : appointment.status === "payment_pending"
      ? "Payment is still pending."
      : "Appointment status updated.";

  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="mx-auto grid max-w-2xl gap-8">
        {/* Success Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1D2153]">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Your appointment has been registered with the clinic. Please arrive 10 minutes prior to your scheduled time.
          </p>
        </div>

        {/* Clinical Confirmation Ticket */}
        <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 bg-surface-muted/30 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                In-Clinic Appointment Ticket
              </span>
              <CardTitle className="text-xl font-bold text-[#1D2153] mt-1">
                {doctor.clinic_name}
              </CardTitle>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 self-start sm:self-auto">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span>Confirmed Visit</span>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-5 text-xs">
            {/* Doctor Info */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-border/60">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                MD
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Consulting Specialist
                </p>
                <p className="text-base font-bold text-[#1D2153]">
                  {doctor.clinic_name}
                </p>
              </div>
            </div>

            {/* Time & Clinic Location */}
            <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <Clock className="size-4 text-primary shrink-0" />
                <span>
                  {formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, doctor.timezone)} ({doctor.timezone})
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <MapPin className="size-4 text-primary shrink-0" />
                <span>{doctor.clinic_name}</span>
              </div>
            </div>

            {/* Visit Reason if provided */}
            {appointment.reason && (
              <div className="rounded-2xl bg-surface-muted/80 p-4 space-y-1">
                <p className="font-semibold text-foreground text-[11px]">Reason for Consultation</p>
                <p className="text-muted-foreground leading-relaxed italic">
                  &ldquo;{appointment.reason}&rdquo;
                </p>
              </div>
            )}

            {/* Payment Record */}
            {payment && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-primary" />
                    <span className="font-bold text-foreground">
                      {payment.currency} {(payment.amount_minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <PaymentStatusBadge status={payment.payment_status} />
                </div>
                {payment.refund_status && (
                  <div className="pt-1">
                    <RefundStatusBadge status={payment.refund_status} />
                  </div>
                )}
                <Link
                  href={`/patient/payments/${payment.payment_id}`}
                  className="inline-flex text-[11px] font-semibold text-primary hover:underline pt-1"
                >
                  View payment receipt →
                </Link>
              </div>
            )}

            {/* In-App Notification Confirmation */}
            {notification && (
              <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-1 text-emerald-950">
                <p className="font-bold flex items-center gap-1.5 text-xs text-emerald-900">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>{notification.title}</span>
                </p>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  {notification.message}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="rounded-xl font-semibold px-6">
            <Link href="/patient/appointments">View My Appointments</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/doctors">Find Another Doctor</Link>
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}
