import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getPatientAppointments } from "@/lib/appointments/queries";
import type { AppointmentTab } from "@/lib/validation/appointments";
import { CancelAppointmentForm } from "@/components/cancel-appointment-form";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import { PendingLink } from "@/components/pending-link";

export const instant = false;

const tabs: Array<{ value: AppointmentTab; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
];

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "full" }).format(new Date(value));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeStyle: "short" }).format(new Date(value));
}

export default async function AppointmentsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const requestedTab = (await searchParams)?.tab;
  const tab: AppointmentTab = requestedTab === "past" || requestedTab === "cancelled" ? requestedTab : "upcoming";
  const appointments = await getPatientAppointments(tab);
  return <PortalShell role="patient" name={account.profile.full_name}>
    <div className="grid gap-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Appointments</h1><p className="mt-2 text-muted-foreground">Your visits, all in one place.</p></div>
      <nav aria-label="Appointment status" className="flex flex-wrap gap-2 border-b pb-3">{tabs.map((item) => <PendingLink key={item.value} href={`/patient/appointments?tab=${item.value}`} active={tab === item.value} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{item.label}</PendingLink>)}</nav>
      {appointments.length === 0 ? <EmptyState title={`No ${tab} appointments`} description={tab === "upcoming" ? "Find a doctor when you are ready to book." : "Appointments in this category will appear here."} /> : <div className="grid gap-3 lg:grid-cols-2">{appointments.map((appointment) => <Card key={appointment.appointment_id}><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>{appointment.doctor_name}</CardTitle><CardDescription>{appointment.specialty} · {appointment.clinic_name}</CardDescription></div><Badge variant={appointment.status === "confirmed" ? "secondary" : "outline"}>{appointment.status.replace("_", " ")}</Badge></CardHeader><CardContent className="grid gap-4 text-sm"><div><p className="font-medium">{formatDate(appointment.slot_start_at, appointment.timezone)}</p><p className="text-muted-foreground">{formatTime(appointment.slot_start_at, appointment.timezone)} – {formatTime(appointment.slot_end_at, appointment.timezone)} ({appointment.timezone})</p></div>{appointment.payment_amount_minor && <p className="text-muted-foreground">Payment: ₹{(appointment.payment_amount_minor / 100).toFixed(2)} · {appointment.payment_status ?? "legacy"}</p>}{appointment.refund_status && <p className="text-muted-foreground">Refund: ₹{((appointment.refund_amount_minor ?? 0) / 100).toFixed(2)} · {appointment.refund_status}</p>}{appointment.reason && <div className="rounded-lg bg-muted p-3"><p className="font-medium">Visit reason</p><p className="mt-1 text-muted-foreground">{appointment.reason}</p></div>}{tab === "upcoming" && appointment.status === "confirmed" && <CancelAppointmentForm appointmentId={appointment.appointment_id} />}</CardContent></Card>)}</div>}
    </div>
  </PortalShell>;
}
