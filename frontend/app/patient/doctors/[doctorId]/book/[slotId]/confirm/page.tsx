import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Coins,
  Lock,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getBookableSlot } from "@/lib/booking/queries";
import { formatSlotTime, isUuid } from "@/lib/discovery/directory";
import { BookingConfirmForm } from "@/components/booking-confirm-form";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function BookingConfirmPage({
  params,
}: {
  params: Promise<{ doctorId: string; slotId: string }>;
}) {
  await connection();
  const account = await requireRole("patient");
  const { doctorId, slotId } = await params;
  if (!isUuid(doctorId) || !isUuid(slotId)) notFound();
  const slot = await getBookableSlot(slotId);
  if (!slot || slot.doctor_id !== doctorId) notFound();

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(slot.slot_start_at));

  const initials =
    slot.full_name
      .replace(/^(Dr\.?)\s+/i, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "DR";

  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="mx-auto grid max-w-2xl gap-6">
        <Link
          href={`/patient/doctors/${doctorId}/book/${slotId}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Edit Visit Reason
        </Link>

        {/* Step Indicator */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-300">
              Step 2 of 2
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Final Verification
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
            Confirm Your Appointment
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Please review the consultation details below before locking your booking.
          </p>
        </div>

        {/* 15-Minute Slot Hold Notice */}
        <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-950">
          <Lock className="size-4 text-sky-700 shrink-0" />
          <p className="leading-relaxed">
            <strong>Slot Reserved:</strong> This appointment time is held exclusively for you for 15 minutes while you review and confirm.
          </p>
        </div>

        {/* Appointment Review Card */}
        <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 bg-surface-muted/30 p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm shadow-inner">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {slot.specialty}
                  </span>
                  <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="size-3 text-emerald-600" />
                    Verified Specialist
                  </span>
                </div>
                <CardTitle className="text-base font-bold text-[#1D2153] mt-0.5">
                  {slot.full_name}
                </CardTitle>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* Consultation Details */}
            <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <CalendarDays className="size-4 text-primary shrink-0" />
                <span>{formattedDate}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <Clock className="size-4 text-primary shrink-0" />
                <span>
                  {formatSlotTime(slot.slot_start_at, slot.timezone)} –{" "}
                  {formatSlotTime(slot.slot_end_at, slot.timezone)} ({slot.timezone})
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <MapPin className="size-4 text-primary shrink-0" />
                <span>{slot.clinic_name}</span>
              </div>

              {slot.consultation_fee_minor !== null && slot.consultation_fee_minor > 0 && (
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Coins className="size-4 text-primary" />
                    Consultation Fee
                  </span>
                  <span className="font-bold text-slate-900">
                    {slot.consultation_currency || "INR"} {(slot.consultation_fee_minor / 100).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Form */}
            <BookingConfirmForm
              slotId={slotId}
              reason=""
              backHref={`/patient/doctors/${doctorId}/book/${slotId}`}
              amountMinor={slot.consultation_fee_minor}
              currency={slot.consultation_currency}
            />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
