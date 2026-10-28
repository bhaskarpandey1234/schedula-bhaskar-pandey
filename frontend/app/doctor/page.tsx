import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { PortalShell } from "@/components/portal-shell";
import { DoctorProfileForm } from "@/components/doctor-profile-form";
import { AvailabilityForm } from "@/components/availability-form";
import { ScheduleCreatedNotice } from "@/components/schedule-created-notice";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { connection } from "next/server";

export const instant = false;

function localDate(timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function localTime(value: string, timezone: string) { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

export default async function DoctorPage({ searchParams }: { searchParams?: Promise<{ date?: string; created?: string }> }) {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctors").select("specialty, clinic_name, experience_years, biography, timezone").eq("id", account.user.id).single();
  if (!doctor) return null;
  const today = localDate(doctor.timezone);
  const params = await searchParams;
  const requestedDate = params?.date;
  const selectedDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;
  const schedule = await getDoctorSchedule(selectedDate);
  const appointmentsBySlot = new Map<string, typeof schedule.appointments>();
  for (const appointment of schedule.appointments ?? []) appointmentsBySlot.set(appointment.slot_id, [...(appointmentsBySlot.get(appointment.slot_id) ?? []), appointment]);
  return <PortalShell role="doctor" name={account.profile.full_name}>
    <div className="grid gap-8">
      <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Doctor portal</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Manage your practice and availability.</h1><p className="mt-4 max-w-2xl text-muted-foreground">Create future wave-scheduling sessions and keep your professional profile ready for patients.</p></div>
      {params?.created === "1" && <ScheduleCreatedNotice date={selectedDate} />}
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]"><DoctorProfileForm profile={{ fullName: account.profile.full_name, specialty: doctor.specialty, clinicName: doctor.clinic_name, experienceYears: doctor.experience_years, biography: doctor.biography, timezone: doctor.timezone }} /><AvailabilityForm timezone={doctor.timezone} defaultDate={selectedDate} /></div>
      <Card id="schedule"><CardHeader><CardTitle>Schedule</CardTitle><CardDescription>Choose a date to review generated slots, patient appointments, and remaining capacity.</CardDescription><form className="flex flex-wrap items-end gap-3" method="get"><div className="grid gap-2"><label htmlFor="schedule-date" className="text-sm font-medium">Schedule date</label><Calendar id="schedule-date" name="date" defaultValue={selectedDate} /></div><button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[.98]" type="submit">View date</button></form></CardHeader><CardContent>{schedule.slots.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No availability has been created for {selectedDate}.</p> : <Table><TableHeader><TableRow><TableHead>Time window</TableHead><TableHead>Patient</TableHead><TableHead>Capacity</TableHead><TableHead>Booked</TableHead><TableHead>Remaining</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{schedule.slots.map((slot) => { const appointments = appointmentsBySlot.get(slot.id) ?? []; return <TableRow key={slot.id}><TableCell>{localTime(slot.slot_start_at, doctor.timezone)} – {localTime(slot.slot_end_at, doctor.timezone)}</TableCell><TableCell>{appointments.length ? <div className="grid gap-1">{appointments.map((appointment) => <span key={appointment.appointment_id} className="inline-flex items-center gap-2">{appointment.patient_name}<Badge variant={appointment.status === "confirmed" ? "secondary" : "outline"}>{appointment.status}</Badge></span>)}</div> : <span className="text-muted-foreground">No appointments</span>}</TableCell><TableCell>{slot.capacity}</TableCell><TableCell>{slot.allocated_count}</TableCell><TableCell>{Math.max(0, slot.capacity - slot.allocated_count)}</TableCell><TableCell><Badge variant={slot.status === "available" ? "secondary" : "outline"}>{slot.status}</Badge></TableCell></TableRow>; })}</TableBody></Table>}</CardContent></Card>
    </div>
  </PortalShell>;
}
