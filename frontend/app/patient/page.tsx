import { connection } from "next/server";
import Link from "next/link";
import { CalendarDays, Search, UserRound } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPatientAppointments } from "@/lib/appointments/queries";

export const instant = false;

export default async function PatientPage() {
  await connection();
  const account = await requireRole("patient");
  const appointments = await getPatientAppointments("upcoming");
  const next = appointments[0];
  return <PortalShell role="patient" name={account.profile.full_name}>
    <div className="grid gap-6">
      <div><p className="text-sm font-medium text-primary">Patient dashboard</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Good to see you, {account.profile.full_name.split(" ")[0]}.</h1><p className="mt-2 text-muted-foreground">Find care and keep your next visit in view.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4 text-primary" />Next appointment</CardTitle></CardHeader><CardContent>{next ? <><p className="font-medium">{next.doctor_name}</p><p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: next.timezone }).format(new Date(next.slot_start_at))}</p></> : <p className="text-sm text-muted-foreground">No upcoming visits</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="size-4 text-primary" />Find care</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Browse doctors and open appointment times.</p><Button asChild size="sm" className="mt-3"><Link href="/doctors">Find doctors</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Your profile</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Keep your contact details current.</p><Button asChild size="sm" variant="outline" className="mt-3"><Link href="/patient/profile">View profile</Link></Button></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Upcoming appointments</CardTitle></CardHeader><CardContent>{appointments.length ? <div className="grid gap-3">{appointments.slice(0, 3).map((appointment) => <div key={appointment.appointment_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{appointment.doctor_name}</p><p className="text-sm text-muted-foreground">{appointment.specialty} · {appointment.clinic_name}</p></div><Button asChild size="sm" variant="outline"><Link href={`/patient/appointments/${appointment.appointment_id}/confirmation`}>View details</Link></Button></div>)}</div> : <p className="text-sm text-muted-foreground">You have no upcoming appointments.</p>}</CardContent></Card>
    </div>
  </PortalShell>;
}
