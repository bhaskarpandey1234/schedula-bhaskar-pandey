import { connection } from "next/server";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  MapPin,
  Search,
} from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getPatientAppointments } from "@/lib/appointments/queries";
import type { AppointmentTab } from "@/lib/validation/appointments";
import { CancelAppointmentForm } from "@/components/cancel-appointment-form";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/payment-status";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { PendingLink } from "@/components/pending-link";

export const instant = false;

const tabs: Array<{ value: AppointmentTab; label: string }> = [
  { value: "upcoming", label: "Upcoming Visits" },
  { value: "past", label: "Past Visits" },
  { value: "cancelled", label: "Cancelled" },
];

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await connection();
  const account = await requireRole("patient");
  const requestedTab = (await searchParams)?.tab;
  const tab: AppointmentTab =
    requestedTab === "past" || requestedTab === "cancelled"
      ? requestedTab
      : "upcoming";
  const appointments = await getPatientAppointments(tab);

  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="space-y-6 max-w-6xl">
        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
              Appointments
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Review confirmed visits, clinic schedules, and consultation records.
            </p>
          </div>
          <Button asChild size="sm" className="rounded-xl font-semibold self-start sm:self-auto">
            <Link href="/doctors">
              <Search className="size-3.5 mr-1.5" />
              Book New Visit
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
              href={`/patient/appointments?tab=${item.value}`}
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
            title={`No ${tab} appointments`}
            description={
              tab === "upcoming"
                ? "You do not have any upcoming doctor appointments scheduled."
                : "Appointments in this category will appear here after consultations."
            }
            action={
              tab === "upcoming" ? (
                <Button asChild className="rounded-xl font-semibold">
                  <Link href="/doctors">Find a Doctor</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {appointments.map((appointment) => {
              const initials =
                appointment.doctor_name
                  .replace(/^(Dr\.?)\s+/i, "")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase() || "DR";

              return (
                <Card
                  key={appointment.appointment_id}
                  className="overflow-hidden rounded-2xl border-border bg-card shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <CardHeader className="flex-row items-start justify-between gap-4 p-5 pb-3">
                    <div className="flex items-start gap-3.5">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm shadow-inner">
                        {initials}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                            {appointment.specialty}
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-[#1D2153]">
                          {appointment.doctor_name}
                        </h2>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                          <MapPin className="size-3 text-primary shrink-0" />
                          <span>{appointment.clinic_name}</span>
                        </p>
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

                  <CardContent className="space-y-4 p-5 pt-0 text-xs">
                    {/* Time Window Card */}
                    <div className="rounded-xl border border-border/80 bg-surface-muted/50 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <CalendarDays className="size-3.5 text-primary" />
                        <span>{formatDate(appointment.slot_start_at, appointment.timezone)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                        <Clock className="size-3.5 text-primary" />
                        <span>
                          {formatTime(appointment.slot_start_at, appointment.timezone)} –{" "}
                          {formatTime(appointment.slot_end_at, appointment.timezone)} ({appointment.timezone})
                        </span>
                      </div>
                    </div>

                    {/* Payment / Refund Status if applicable */}
                    {appointment.payment_amount_minor && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="font-semibold text-slate-800">
                          Fee: ₹{(appointment.payment_amount_minor / 100).toFixed(2)}
                        </span>
                        {appointment.payment_status && (
                          <PaymentStatusBadge status={appointment.payment_status} />
                        )}
                        {appointment.refund_status && (
                          <RefundStatusBadge status={appointment.refund_status} />
                        )}
                      </div>
                    )}

                    {/* Visit Reason Box */}
                    {appointment.reason && (
                      <div className="rounded-xl bg-surface-muted/80 p-3 space-y-0.5">
                        <p className="font-semibold text-foreground text-[11px]">Reason for Consultation</p>
                        <p className="text-muted-foreground leading-relaxed italic">
                          &ldquo;{appointment.reason}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* Action Footer */}
                    <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
                      <Button asChild size="sm" variant="ghost" className="text-xs font-semibold text-primary">
                        <Link href={`/patient/appointments/${appointment.appointment_id}/confirmation`}>
                          View Confirmation Ticket →
                        </Link>
                      </Button>

                      {tab === "upcoming" && appointment.status === "confirmed" && (
                        <CancelAppointmentForm appointmentId={appointment.appointment_id} />
                      )}

                      {tab === "past" && (
                        <Button asChild size="sm" variant="outline" className="rounded-xl">
                          <Link href="/doctors">Book Again</Link>
                        </Button>
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
