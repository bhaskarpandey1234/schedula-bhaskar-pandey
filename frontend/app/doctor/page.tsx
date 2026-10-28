import { connection } from "next/server";
import { AvailabilityForm } from "@/components/availability-form";
import { PortalShell } from "@/components/portal-shell";
import { ScheduleCreatedNotice } from "@/components/schedule-created-notice";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

function localDate(timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function localTime(value: string, timezone: string) { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

export default async function DoctorPage({ searchParams }: { searchParams?: Promise<{ date?: string; created?: string }> }) {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctors").select("timezone").eq("id", account.user.id).single();
  if (!doctor) return null;
  const params = await searchParams;
  const today = localDate(doctor.timezone);
  const selectedDate = params?.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const schedule = await getDoctorSchedule(selectedDate);
  const appointmentsBySlot = new Map<string, typeof schedule.appointments>();
  for (const appointment of schedule.appointments ?? []) appointmentsBySlot.set(appointment.slot_id, [...(appointmentsBySlot.get(appointment.slot_id) ?? []), appointment]);
  return <PortalShell role="doctor" name={account.profile.full_name}><div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Doctor workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Schedule and availability</h1></div><form className="flex items-end gap-2" method="get"><div className="grid gap-1"><label htmlFor="schedule-date" className="text-sm font-medium">Date</label><Calendar id="schedule-date" name="date" defaultValue={selectedDate} /></div><button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="submit">View</button></form></div>
    {params?.created === "1" && <ScheduleCreatedNotice date={selectedDate} />}
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><AvailabilityForm timezone={doctor.timezone} defaultDate={selectedDate} /><Card id="schedule"><CardHeader><CardTitle>Appointments for {selectedDate}</CardTitle><CardDescription>Review slots, capacity, and patient appointments.</CardDescription></CardHeader><CardContent>{schedule.slots.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No availability has been created for this date.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Patient</TableHead><TableHead>Booked / capacity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{schedule.slots.map((slot) => { const appointments = appointmentsBySlot.get(slot.id) ?? []; return <TableRow key={slot.id}><TableCell>{localTime(slot.slot_start_at, doctor.timezone)} – {localTime(slot.slot_end_at, doctor.timezone)}</TableCell><TableCell>{appointments.length ? <div className="grid gap-1">{appointments.map((appointment) => <span key={appointment.appointment_id}>{appointment.patient_name}</span>)}</div> : <span className="text-muted-foreground">—</span>}</TableCell><TableCell>{slot.allocated_count} / {slot.capacity}</TableCell><TableCell><Badge variant={slot.status === "available" ? "secondary" : "outline"}>{slot.status}</Badge></TableCell></TableRow>; })}</TableBody></Table></div>}</CardContent></Card></div>
  </div></PortalShell>;
}
