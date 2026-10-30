import { connection } from "next/server";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Clock,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { getPatientAppointments } from "@/lib/appointments/queries";
import { formatLocalSlotRange } from "@/lib/scheduling/time";

export const instant = false;

export default async function PatientPage() {
  await connection();
  const account = await requireRole("patient");
  const appointments = await getPatientAppointments("upcoming");
  const next = appointments[0];

  const firstName = account.profile.full_name?.split(" ")[0] || "there";

  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="space-y-8 max-w-6xl">
        {/* Welcome Gradient Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-50 via-teal-50/40 to-white p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2">
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
                </span>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  Patient Health Portal
                </p>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
                Good to see you, {firstName} 👋
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xl leading-relaxed">
                Review your upcoming appointments, find top doctors across 12+ specialties, and keep your care on schedule.
              </p>
            </div>

            <Button asChild className="rounded-xl shadow-xs self-start sm:self-auto shrink-0 font-semibold px-5">
              <Link href="/doctors">
                <Search className="size-4 mr-2" />
                Find Doctors
              </Link>
            </Button>
          </div>
        </div>

        {/* Featured Next Appointment Ticket */}
        <section aria-labelledby="next-appointment-heading" className="space-y-3">
          <h2 id="next-appointment-heading" className="text-base font-bold text-[#1D2153] flex items-center gap-2">
            <CalendarCheck2 className="size-4 text-primary" />
            <span>Next Upcoming Appointment</span>
          </h2>

          {next ? (
            <div className="overflow-hidden rounded-3xl border border-primary/20 bg-card p-6 shadow-sm transition-all hover:border-primary/40">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                {/* Left: Doctor & Specialty Info */}
                <div className="flex items-start gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-lg shadow-inner">
                    {next.doctor_name
                      .replace(/^(Dr\.?)\s+/i, "")
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase() || "DR"}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                        {next.specialty}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="size-3 text-emerald-600" />
                        Confirmed Visit
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-[#1D2153]">
                      {next.doctor_name}
                    </h3>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <MapPin className="size-3.5 text-primary shrink-0" />
                      <span>{next.clinic_name}</span>
                    </p>
                  </div>
                </div>

                {/* Center: Appointment Date & Time Window */}
                <div className="rounded-2xl border border-border/80 bg-surface-muted/60 p-4 lg:w-72 space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Scheduled Time
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {formatLocalSlotRange(next.slot_start_at, next.slot_end_at, next.timezone)}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3 text-primary" />
                    <span>Timezone: {next.timezone}</span>
                  </p>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button asChild className="rounded-xl font-semibold">
                    <Link href={`/patient/appointments/${next.appointment_id}/confirmation`}>
                      View Details
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link href="/patient/appointments">
                      Manage Visit
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-dashed border-border bg-card p-6 sm:flex-row sm:p-8">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CalendarDays className="size-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">No upcoming visits</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Schedule an in-clinic consultation with top specialists near you.
                  </p>
                </div>
              </div>
              <Button asChild className="rounded-xl font-semibold shrink-0">
                <Link href="/doctors">
                  <span>Explore Doctors</span>
                  <ArrowRight className="size-4 ml-1.5" />
                </Link>
              </Button>
            </div>
          )}
        </section>

        {/* 3 Interactive Quick-Action Cards */}
        <section aria-labelledby="quick-actions-heading" className="space-y-3">
          <h2 id="quick-actions-heading" className="text-base font-bold text-[#1D2153]">
            Quick Shortcuts
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/doctors"
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 transition-colors group-hover:bg-sky-500 group-hover:text-white">
                  <Search className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Find Care</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Search certified doctors, view open slots, and book same-day appointments.
                </p>
              </div>
              <span className="mt-4 flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <span>Browse doctors</span>
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <Link
              href="/#browse-care"
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 transition-colors group-hover:bg-teal-500 group-hover:text-white">
                  <Sparkles className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Specialties</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Explore care areas: Dentistry, Gynecology, Pediatrics, Cardiology, and more.
                </p>
              </div>
              <span className="mt-4 flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <span>View 12+ specialties</span>
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <Link
              href="/patient/profile"
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
                  <UserRound className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">My Profile</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keep your phone number and contact details up-to-date for visit reminders.
                </p>
              </div>
              <span className="mt-4 flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <span>Manage account</span>
                <ArrowRight className="size-3.5" />
              </span>
            </Link>
          </div>
        </section>

        {/* Upcoming Appointments List */}
        {appointments.length > 1 && (
          <section aria-labelledby="all-appointments-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="all-appointments-heading" className="text-base font-bold text-[#1D2153]">
                Upcoming Appointments ({appointments.length})
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-xs font-semibold text-primary">
                <Link href="/patient/appointments">View All →</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {appointments.slice(1, 3).map((appointment) => (
                <div
                  key={appointment.appointment_id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">{appointment.doctor_name}</p>
                    <p className="text-xs text-muted-foreground">{appointment.specialty} · {appointment.clinic_name}</p>
                    <p className="text-[11px] font-medium text-primary">
                      {formatLocalSlotRange(appointment.slot_start_at, appointment.slot_end_at, appointment.timezone)}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="rounded-xl shrink-0">
                    <Link href={`/patient/appointments/${appointment.appointment_id}/confirmation`}>
                      Details
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalShell>
  );
}
