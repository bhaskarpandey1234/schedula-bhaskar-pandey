import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin, UserCheck } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorAppointmentDetail } from "@/lib/appointments/queries";
import { CancelDoctorAppointmentForm } from "@/components/cancel-doctor-appointment-form";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { isUuid } from "@/lib/discovery/directory";

export const instant = false;

export default async function DoctorAppointmentDetailPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  await connection();
  const account = await requireRole("doctor");
  const { appointmentId } = await params;
  if (!isUuid(appointmentId)) notFound();
  const appointment = await getDoctorAppointmentDetail(appointmentId);
  if (!appointment) notFound();
  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="mx-auto grid max-w-3xl gap-6">
        <Link href="/doctor/appointments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to appointments
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Appointment details</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{appointment.patient_name}</h1>
          </div>
          <Badge variant={appointment.status === "confirmed" ? "secondary" : "outline"} className="capitalize">{appointment.status.replace("_", " ")}</Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCheck className="size-5 text-primary" /> Patient appointment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center gap-2 font-medium"><CalendarDays className="size-4 text-primary" />{formatLocalSlotRange(appointment.slot_start_at, appointment.slot_end_at, appointment.timezone)}</div>
              <p className="mt-2 flex items-center gap-2 text-muted-foreground"><Clock className="size-4" />Timezone: {appointment.timezone}</p>
              <p className="mt-2 flex items-center gap-2 text-muted-foreground"><MapPin className="size-4" />{appointment.clinic_name}</p>
            </div>
            {appointment.reason && <div className="rounded-lg bg-muted p-4"><p className="font-medium">Patient stated reason</p><p className="mt-1 text-muted-foreground">{appointment.reason}</p></div>}
            {appointment.is_cancellable && <div className="flex justify-end border-t pt-4"><CancelDoctorAppointmentForm appointmentId={appointment.appointment_id} /></div>}
          </CardContent>
        </Card>
        <Button asChild variant="outline" className="justify-self-start"><Link href="/doctor/appointments">View all appointments</Link></Button>
      </div>
    </PortalShell>
  );
}
