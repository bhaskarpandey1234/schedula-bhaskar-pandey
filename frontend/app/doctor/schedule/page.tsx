import { connection } from "next/server";
import {
  CalendarCheck2,
  CalendarDays,
  Info,
  UserCheck,
} from "lucide-react";
import { AvailabilityForm } from "@/components/availability-form";
import { PortalShell } from "@/components/portal-shell";
import { ScheduleCreatedNotice } from "@/components/schedule-created-notice";
import { ScheduleFilterForm } from "@/components/schedule-filter-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    return { title: "All Published Slots", empty: "No availability has been created yet." };
  }
  if (selection.filter === "past") {
    return { title: "Past Slots Archive", empty: "No past availability was found in this period." };
  }
  if (selection.filter === "specific" && selection.date) {
    const date = formatLocalDate(`${selection.date}T12:00:00Z`, timezone);
    return { title: `Slots for ${date}`, empty: `No slots created for ${date}. Create a session using the form.` };
  }
  return { title: "Upcoming Slots", empty: "No upcoming availability has been created yet." };
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
    .select("timezone, specialty, clinic_name")
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
      <div className="space-y-6 max-w-6xl">
        {/* Header Console */}
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">
                Practice Availability Manager
              </p>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
              Clinic Slots & Wave Schedule
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Define your consulting hours, configure patient capacity per slot, and monitor live bookings.
            </p>
          </div>

          <ScheduleFilterForm initialFilter={selection.filter} initialDate={selectedDate} />
        </div>

        {/* Notice of Creation */}
        {params?.created === "1" && <ScheduleCreatedNotice date={selectedDate} />}

        {/* 2-Column Responsive Workspace */}
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          {/* Left Column: Form Card */}
          <div className="space-y-4">
            <AvailabilityForm
              key={initialMode}
              timezone={doctor.timezone}
              defaultDate={selectedDate}
              initialMode={initialMode}
            />

            <div className="rounded-2xl border border-border/80 bg-surface-muted/50 p-4 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <Info className="size-4 text-primary" />
                <span>Wave Scheduling Overview</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Slots default to 30-minute intervals with a capacity of 3 patients. This wave model smooths intake while preventing overbooking.
              </p>
            </div>
          </div>

          {/* Right Column: Grouped Slot Roster */}
          <Card id="schedule" className="rounded-3xl border-border bg-card shadow-xs overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-surface-muted/30 p-5">
              <CardTitle className="text-base font-bold text-[#1D2153] flex items-center justify-between">
                <span>{copy.title}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Showing {visibleSlots.length} {visibleSlots.length === 1 ? "slot" : "slots"}
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-5">
              {visibleSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                  <CalendarDays className="size-8 mx-auto text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">{copy.empty}</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Use the creation form on the left to publish bookable appointment slots.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map((group) => (
                    <section key={group.date} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <CalendarCheck2 className="size-4 text-primary" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          {formatLocalDate(`${group.date}T12:00:00Z`, doctor.timezone)}
                        </h2>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-border/80">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-surface-muted/60 text-xs">
                              <TableHead className="font-bold text-foreground">Time Window</TableHead>
                              <TableHead className="font-bold text-foreground">Booked Patients</TableHead>
                              <TableHead className="font-bold text-foreground">Capacity</TableHead>
                              <TableHead className="font-bold text-foreground">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.slots.map((slot) => {
                              const appointments = appointmentsBySlot.get(slot.id) ?? [];
                              const remaining = slot.capacity - slot.allocated_count;
                              const isFull = remaining <= 0;
                              const hasBookings = slot.allocated_count > 0;

                              return (
                                <TableRow key={slot.id} className="text-xs hover:bg-surface-muted/30">
                                  <TableCell className="font-semibold text-foreground whitespace-nowrap">
                                    {formatLocalSlotRange(
                                      slot.slot_start_at,
                                      slot.slot_end_at,
                                      doctor.timezone,
                                    )}
                                  </TableCell>

                                  <TableCell>
                                    {appointments.length ? (
                                      <div className="space-y-1">
                                        {appointments.map((appointment) => (
                                          <div
                                            key={appointment.appointment_id}
                                            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary mr-1"
                                          >
                                            <UserCheck className="size-3" />
                                            <span>{appointment.patient_name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground/60 italic">No bookings yet</span>
                                    )}
                                  </TableCell>

                                  <TableCell className="whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 font-medium">
                                      <span
                                        className={
                                          isFull
                                            ? "text-destructive font-bold"
                                            : hasBookings
                                            ? "text-primary font-bold"
                                            : "text-muted-foreground"
                                        }
                                      >
                                        {slot.allocated_count} / {slot.capacity}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        ({remaining} left)
                                      </span>
                                    </div>
                                  </TableCell>

                                  <TableCell>
                                    <Badge
                                      variant={
                                        isFull
                                          ? "destructive"
                                          : slot.status === "available"
                                          ? "secondary"
                                          : "outline"
                                      }
                                      className="capitalize text-[10px]"
                                    >
                                      {isFull ? "Booked Out" : slot.status}
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
