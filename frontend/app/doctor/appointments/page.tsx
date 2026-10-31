import { connection } from "next/server";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  UserCheck,
  Users,
} from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorAppointments } from "@/lib/appointments/queries";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { PendingLink } from "@/components/pending-link";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { CancelDoctorAppointmentForm } from "@/components/cancel-doctor-appointment-form";

export const instant = false;
type Tab = "upcoming" | "past" | "cancelled";

const tabs: Array<{ value: Tab; label: string }> = [
  { value: "upcoming", label: "Upcoming Consultations" },
  { value: "past", label: "Past Visits" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function DoctorAppointmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await connection();
  const account = await requireRole("doctor");
  const requested = (await searchParams)?.tab;
  const tab: Tab =
    requested === "past" || requested === "cancelled" ? requested : "upcoming";
  const appointments = await getDoctorAppointments(tab);

  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="space-y-6 max-w-6xl">
        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Users className="size-3.5" />
              <span>Practice Roster</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
              Patient Consultations
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Review confirmed patient visits, intake symptoms, and consultation schedules.
            </p>
          </div>

          <Button asChild size="sm" className="rounded-xl font-semibold self-start sm:self-auto">
            <Link href="/doctor/schedule">
              <CalendarDays className="size-3.5 mr-1.5" />
              Open Schedule
            </Link>
          </Button>
        </div>

        {/* Tab Navigation Pill Bar */}
        <nav
          aria-label="Appointment status"
          className="flex flex-wrap gap-2 border-b border-border/70 pb-3"
        >
          {tabs.map((item) => (
            <PendingLink
              key={item.value}
              href={`/doctor/appointments?tab=${item.value}`}
              active={tab === item.value}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                tab === item.value
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-muted text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              {item.label}
            </PendingLink>
          ))}
        </nav>

        {/* Appointments List / Grid */}
        {appointments.length === 0 ? (
          <EmptyState
            title={`No ${tab} patient appointments`}
            description={
              tab === "upcoming"
                ? "You do not have any upcoming patient consultations scheduled for this period."
                : "Past patient appointments will be archived here after consultation times pass."
            }
            action={
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/doctor/schedule">Manage Availability</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {appointments.map((appointment) => {
              const initials =
                appointment.patient_name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase() || "PT";

              return (
                <Card
                  key={appointment.appointment_id}
                  className="overflow-hidden rounded-2xl border-border bg-card shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <CardHeader className="flex-row items-start justify-between gap-4 p-5 pb-3">
                    <div className="flex items-center gap-3.5">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 font-bold text-sm shadow-inner">
                        {initials}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="size-3.5 text-emerald-600" />
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Patient
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-[#1D2153]">
                          {appointment.patient_name}
                        </h2>
                      </div>
                    </div>

                    <Badge
                      variant={
                        appointment.status === "confirmed" ? "secondary" : "outline"
                      }
                      className="text-xs font-semibold capitalize"
                    >
                      {appointment.status.replace("_", " ")}
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-3.5 p-5 pt-0 text-xs">
                    {/* Time Window Card */}
                    <div className="rounded-xl border border-border/80 bg-surface-muted/50 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <Clock className="size-3.5 text-primary" />
                        <span>
                          {formatLocalSlotRange(
                            appointment.slot_start_at,
                            appointment.slot_end_at,
                            appointment.timezone
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Timezone: {appointment.timezone}
                      </p>
                    </div>

                    {/* Patient Visit Reason */}
                    {appointment.reason ? (
                      <div className="rounded-xl bg-surface-muted/80 p-3 space-y-1">
                        <p className="font-semibold text-foreground text-[11px]">
                          Patient Stated Reason
                        </p>
                        <p className="text-muted-foreground leading-relaxed italic">
                          &ldquo;{appointment.reason}&rdquo;
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/75 italic">
                        No specific visit reason provided by patient.
                      </p>
                    )}

                    {/* Action Footer */}
                    <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
                      <Button asChild size="sm" variant="ghost" className="text-xs font-semibold text-primary">
                        <Link href={`/doctor/appointments/${appointment.appointment_id}`}>
                          View appointment →
                        </Link>
                      </Button>
                      {tab === "upcoming" && appointment.status === "confirmed" && (
                        <CancelDoctorAppointmentForm appointmentId={appointment.appointment_id} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
