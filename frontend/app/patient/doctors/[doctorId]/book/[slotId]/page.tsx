import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin, ShieldCheck } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getBookableSlot } from "@/lib/booking/queries";
import { formatSlotTime, isUuid } from "@/lib/discovery/directory";
import { BookingReasonForm } from "@/components/booking-reason-form";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function BookingPage({
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
          href={`/doctors/${doctorId}#availability`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Doctor Availability
        </Link>

        {/* Step Indicator */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
              Step 1 of 2
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Intake Information
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
            Tell us about your visit
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Provide a short description of your symptoms to help the doctor prepare for your consultation.
          </p>
        </div>

        {/* Slot Summary Card */}
        <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 bg-surface-muted/30 p-5">
            <div className="flex items-start justify-between gap-4">
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
                      Verified
                    </span>
                  </div>
                  <CardTitle className="text-base font-bold text-[#1D2153] mt-0.5">
                    {slot.full_name}
                  </CardTitle>
                </div>
              </div>

              <Badge variant="secondary" className="text-xs font-semibold shrink-0">
                {slot.remaining_capacity} {slot.remaining_capacity === 1 ? "seat" : "seats"} open
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* Time & Clinic Pill */}
            <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-2 text-xs">
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
            </div>

            {/* Form */}
            <BookingReasonForm doctorId={doctorId} slotId={slotId} />
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <Link href={`/doctors/${doctorId}`}>Cancel and Return</Link>
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}
