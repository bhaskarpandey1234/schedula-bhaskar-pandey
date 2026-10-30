import { connection } from "next/server";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Clock,
  MapPin,
  PlusCircle,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function DoctorPage() {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("timezone, specialty, clinic_name, consultation_fee_minor, experience_years")
    .eq("id", account.user.id)
    .single();

  if (!doctor) return null;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: doctor.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: doctor.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const schedule = await getDoctorSchedule(today);
  const booked = schedule.slots.reduce((total, slot) => total + slot.allocated_count, 0);
  const totalCapacity = schedule.slots.reduce((total, slot) => total + slot.capacity, 0);

  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="space-y-8 max-w-6xl">
        {/* Practice Header Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-r from-teal-50/70 via-sky-50/40 to-white p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                  {doctor.specialty}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="size-3 text-emerald-600" />
                  Practicing Physician
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
                {account.profile.full_name}&apos;s Practice Hub
              </h1>
              <p className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600">
                <span className="flex items-center gap-1.5 font-medium">
                  <MapPin className="size-3.5 text-primary" />
                  {doctor.clinic_name}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="size-3.5 text-primary" />
                  {todayFormatted} ({doctor.timezone})
                </span>
              </p>
            </div>

            <Button asChild className="rounded-xl font-semibold shadow-xs self-start sm:self-auto shrink-0">
              <Link href="/doctor/schedule">
                <PlusCircle className="size-4 mr-2" />
                Manage Slots
              </Link>
            </Button>
          </div>
        </div>

        {/* 4 Clinical KPI Metrics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Today&apos;s Slots
              </CardTitle>
              <CalendarDays className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-3xl font-extrabold text-[#1D2153]">
                {schedule.slots.length}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                Published wave sessions
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Booked Patients
              </CardTitle>
              <Users className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-3xl font-extrabold text-[#1D2153]">
                {booked}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                {totalCapacity > 0 ? `${booked} of ${totalCapacity} capacity booked` : "No slots open today"}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Consultation Fee
              </CardTitle>
              <Stethoscope className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-3xl font-extrabold text-[#1D2153]">
                {doctor.consultation_fee_minor !== null
                  ? `₹${(doctor.consultation_fee_minor / 100).toFixed(0)}`
                  : "Not set"}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                In-clinic visit rate
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Directory Status
              </CardTitle>
              <ShieldCheck className="size-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-center gap-1.5 pt-1">
                <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold text-foreground">Live & Bookable</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Visible on public search
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Today's Schedule Overview Stream */}
        <section aria-labelledby="today-slots-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="today-slots-heading" className="text-base font-bold text-[#1D2153] flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" />
              <span>Today&apos;s Published Slots ({schedule.slots.length})</span>
            </h2>
            <Button asChild variant="ghost" size="sm" className="text-xs font-semibold text-primary">
              <Link href="/doctor/schedule">Manage All Slots →</Link>
            </Button>
          </div>

          {schedule.slots.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {schedule.slots.map((slot) => {
                const remaining = slot.capacity - slot.allocated_count;
                const isFull = remaining <= 0;
                const hasBookings = slot.allocated_count > 0;

                return (
                  <div
                    key={slot.id}
                    className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs transition-all hover:border-primary/40"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">
                          {formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, doctor.timezone)}
                        </span>
                        <Badge
                          variant={isFull ? "destructive" : hasBookings ? "secondary" : "outline"}
                          className="text-[11px]"
                        >
                          {isFull
                            ? "Full"
                            : `${slot.allocated_count}/${slot.capacity} Booked`}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {remaining} {remaining === 1 ? "seat" : "seats"} available for patients
                      </p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
                      <span className="text-[11px] text-muted-foreground">30m wave interval</span>
                      <Link
                        href={`/doctor/schedule?date=${today}&filter=specific`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Inspect slot →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="size-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">No slots published for today</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  Open your appointment calendar for today so patients can discover and book visits.
                </p>
              </div>
              <Button asChild className="rounded-xl font-semibold">
                <Link href="/doctor/schedule">
                  <PlusCircle className="size-4 mr-1.5" />
                  Add Availability
                </Link>
              </Button>
            </div>
          )}
        </section>

        {/* Quick Practice Shortcuts */}
        <section aria-labelledby="doctor-shortcuts-heading" className="space-y-3">
          <h2 id="doctor-shortcuts-heading" className="text-base font-bold text-[#1D2153]">
            Practice Actions
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/doctor/schedule"
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 transition-colors group-hover:bg-teal-500 group-hover:text-white">
                  <CalendarDays className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Manage Schedule</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Publish recurring weekly slots or customized dates with wave scheduling.
                </p>
              </div>
              <span className="mt-4 flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <span>Open schedule editor</span>
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <Link
              href="/doctor/appointments"
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 transition-colors group-hover:bg-sky-500 group-hover:text-white">
                  <Users className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Patient Appointments</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Review booked patient visits, visit notes, and consultation status.
                </p>
              </div>
              <span className="mt-4 flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <span>View appointments</span>
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <Link
              href="/doctor/profile"
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
                  <UserRound className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Doctor Profile</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Update your consultation fee, clinic location, experience, and biography.
                </p>
              </div>
              <span className="mt-4 flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <span>Edit profile</span>
                <ArrowRight className="size-3.5" />
              </span>
            </Link>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
