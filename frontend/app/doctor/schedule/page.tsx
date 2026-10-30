import { connection } from "next/server";
import { AvailabilityForm } from "@/components/availability-form";
import { PortalShell } from "@/components/portal-shell";
import { ScheduleCreatedNotice } from "@/components/schedule-created-notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { requireRole } from "@/lib/auth/guards";
import { formatLocalDate, formatLocalSlotRange, localDateKey } from "@/lib/scheduling/time";
import { createClient } from "@/lib/supabase/server";

export const instant = false;
function localDate(timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export default async function DoctorSchedulePage({ searchParams }: { searchParams?: Promise<{ date?: string; created?: string; mode?: string }> }) {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctors").select("timezone").eq("id", account.user.id).single();
  if (!doctor) return null;
  const params = await searchParams;
  const today = localDate(doctor.timezone);
  const selectedDate = params?.date === "all" || (params?.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) ? params.date : today;
  const schedule = await getDoctorSchedule("all");
  const dates = [...new Set(schedule.slots.map((slot) => localDateKey(slot.slot_start_at, doctor.timezone)))];
  const visibleSlots = selectedDate === "all" ? schedule.slots : schedule.slots.filter((slot) => localDateKey(slot.slot_start_at, doctor.timezone) === selectedDate);
  const appointmentsBySlot = new Map<string, typeof schedule.appointments>();
  for (const appointment of schedule.appointments ?? []) appointmentsBySlot.set(appointment.slot_id, [...(appointmentsBySlot.get(appointment.slot_id) ?? []), appointment]);
  const groups = visibleSlots.reduce<Array<{ date: string; slots: typeof visibleSlots }>>((result, slot) => { const date = localDateKey(slot.slot_start_at, doctor.timezone); const group = result.at(-1); if (!group || group.date !== date) result.push({ date, slots: [slot] }); else group.slots.push(slot); return result; }, []);
  const initialMode = params?.mode === "custom" ? "custom" : "weekly";
  return <PortalShell role="doctor" name={account.profile.full_name}><div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Schedule</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Availability and slots</h1></div><form className="grid gap-1" method="get"><label htmlFor="schedule-date" className="text-sm font-medium">Show slots</label><div className="flex gap-2"><select id="schedule-date" name="date" defaultValue={selectedDate} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All upcoming dates</option>{dates.map((date) => <option key={date} value={date}>{formatLocalDate(`${date}T12:00:00Z`, doctor.timezone)}</option>)}</select><button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" type="submit">View</button></div></form></div>
    {params?.created === "1" && <ScheduleCreatedNotice date={selectedDate === "all" ? "your selected dates" : selectedDate} />}
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><AvailabilityForm key={initialMode} timezone={doctor.timezone} defaultDate={selectedDate === "all" ? today : selectedDate} initialMode={initialMode} /><Card id="schedule"><CardHeader><CardTitle className="text-base">{selectedDate === "all" ? "All upcoming slots" : `Slots for ${formatLocalDate(`${selectedDate}T12:00:00Z`, doctor.timezone)}`}</CardTitle></CardHeader><CardContent>{visibleSlots.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{selectedDate === "all" ? "No upcoming availability has been created." : "No availability has been created for this date."}</p> : <div className="grid gap-6">{groups.map((group) => <section key={group.date} className="grid gap-2"><h2 className="text-sm font-semibold text-muted-foreground">{formatLocalDate(`${group.date}T12:00:00Z`, doctor.timezone)}</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Patient</TableHead><TableHead>Booked / capacity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{group.slots.map((slot) => { const appointments = appointmentsBySlot.get(slot.id) ?? []; return <TableRow key={slot.id}><TableCell>{formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, doctor.timezone)}</TableCell><TableCell>{appointments.length ? <div className="grid gap-1">{appointments.map((appointment) => <span key={appointment.appointment_id}>{appointment.patient_name}</span>)}</div> : <span className="text-muted-foreground">—</span>}</TableCell><TableCell>{slot.allocated_count} / {slot.capacity}</TableCell><TableCell><Badge variant={slot.status === "available" ? "secondary" : "outline"}>{slot.status}</Badge></TableCell></TableRow>; })}</TableBody></Table></div></section>)}</div>}</CardContent></Card></div>
  </div></PortalShell>;
}
