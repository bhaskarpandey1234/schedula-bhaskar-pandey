import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorAppointments } from "@/lib/appointments/queries";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PendingLink } from "@/components/pending-link";
import { CalendarDays } from "lucide-react";
import { formatLocalSlotRange } from "@/lib/scheduling/time";

export const instant = false;
type Tab = "upcoming" | "past" | "cancelled";

export default async function DoctorAppointmentsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  await connection();
  const account = await requireRole("doctor");
  const requested = (await searchParams)?.tab;
  const tab: Tab = requested === "past" || requested === "cancelled" ? requested : "upcoming";
  const appointments = await getDoctorAppointments(tab);
  return <PortalShell role="doctor" name={account.profile.full_name}><div className="grid gap-6"><div><p className="text-sm font-medium text-primary">Appointments</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Patient visits</h1></div><nav aria-label="Appointment status" className="flex flex-wrap gap-2 border-b pb-3">{(["upcoming", "past", "cancelled"] as Tab[]).map((item) => <PendingLink key={item} href={`/doctor/appointments?tab=${item}`} active={tab === item} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{item[0].toUpperCase() + item.slice(1)}</PendingLink>)}</nav>{appointments.length ? <div className="grid gap-3 lg:grid-cols-2">{appointments.map((appointment) => <Card key={appointment.appointment_id}><CardHeader className="flex-row items-start justify-between gap-4"><CardTitle className="text-base">{appointment.patient_name}</CardTitle><Badge variant={appointment.status === "confirmed" ? "secondary" : "outline"}>{appointment.status}</Badge></CardHeader><CardContent className="grid gap-2 text-sm"><p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" />{formatLocalSlotRange(appointment.slot_start_at, appointment.slot_end_at, appointment.timezone)}</p>{appointment.reason && <p className="text-muted-foreground">{appointment.reason}</p>}</CardContent></Card>)}</div> : <Card><CardContent className="p-6 text-sm text-muted-foreground">No {tab} appointments.</CardContent></Card>}</div></PortalShell>;
}
