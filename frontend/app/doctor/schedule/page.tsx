import { connection } from "next/server";
import { AvailabilityForm } from "@/components/availability-form";
import { PortalShell } from "@/components/portal-shell";
import { ScheduleCreatedNotice } from "@/components/schedule-created-notice";
import { ScheduleFilterForm } from "@/components/schedule-filter-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { requireRole } from "@/lib/auth/guards";
import {
  filterScheduleSlots,
  parseScheduleFilter,
  type ScheduleFilterSelection,
} from "@/lib/scheduling/schedule-filters";
import { formatLocalDate, formatLocalSlotRange, localDateKey } from "@/lib/scheduling/time";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function scheduleCopy(selection: ScheduleFilterSelection, timezone: string) {
  if (selection.filter === "all") {
    return { title: "All slots", empty: "No availability has been created." };
  }
  if (selection.filter === "past") {
    return { title: "Past slots", empty: "No past availability was found." };
  }
  if (selection.filter === "specific" && selection.date) {
    const date = formatLocalDate(`${selection.date}T12:00:00Z`, timezone);
    return { title: `Slots for ${date}`, empty: "No availability has been created for this date." };
  }
  return { title: "Upcoming slots", empty: "No upcoming availability has been created." };
}

export default async function DoctorSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string; date?: string; created?: string; mode?: string }>;
}) {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("timezone")
    .eq("id", account.user.id)
    .single();
  if (!doctor) return null;

  const params = await searchParams;
  const today = localDate(doctor.timezone);
  const selection = parseScheduleFilter(params ?? {});
  const schedule = await getDoctorSchedule("all");
  const visibleSlots = filterScheduleSlots(schedule.slots, selection, doctor.timezone);
  const copy = scheduleCopy(selection, doctor.timezone);

  const appointmentsBySlot = new Map<string, typeof schedule.appointments>();
  for (const appointment of schedule.appointments ?? []) {
    appointmentsBySlot.set(appointment.slot_id, [
      ...(appointmentsBySlot.get(appointment.slot_id) ?? []),
      appointment,
    ]);
  }

  const groups = visibleSlots.reduce<Array<{ date: string; slots: typeof visibleSlots }>>(
    (result, slot) => {
      const date = localDateKey(slot.slot_start_at, doctor.timezone);
      const group = result.at(-1);
      if (!group || group.date !== date) result.push({ date, slots: [slot] });
      else group.slots.push(slot);
      return result;
    },
    [],
  );
  const initialMode = params?.mode === "custom" ? "custom" : "weekly";
  const selectedDate = selection.filter === "specific" ? selection.date ?? today : today;

  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Schedule</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Availability and slots</h1>
          </div>
          <ScheduleFilterForm initialFilter={selection.filter} initialDate={selectedDate} />
        </div>
        {params?.created === "1" && <ScheduleCreatedNotice date={selectedDate} />}
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <AvailabilityForm
            key={initialMode}
            timezone={doctor.timezone}
            defaultDate={selectedDate}
            initialMode={initialMode}
          />
          <Card id="schedule">
            <CardHeader>
              <CardTitle className="text-base">{copy.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {visibleSlots.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {copy.empty}
                </p>
              ) : (
                <div className="grid gap-6">
                  {groups.map((group) => (
                    <section key={group.date} className="grid gap-2">
                      <h2 className="text-sm font-semibold text-muted-foreground">
                        {formatLocalDate(`${group.date}T12:00:00Z`, doctor.timezone)}
                      </h2>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Patient</TableHead>
                              <TableHead>Booked / capacity</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.slots.map((slot) => {
                              const appointments = appointmentsBySlot.get(slot.id) ?? [];
                              return (
                                <TableRow key={slot.id}>
                                  <TableCell>
                                    {formatLocalSlotRange(
                                      slot.slot_start_at,
                                      slot.slot_end_at,
                                      doctor.timezone,
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {appointments.length ? (
                                      <div className="grid gap-1">
                                        {appointments.map((appointment) => (
                                          <span key={appointment.appointment_id}>
                                            {appointment.patient_name}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {slot.allocated_count} / {slot.capacity}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={slot.status === "available" ? "secondary" : "outline"}>
                                      {slot.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}
