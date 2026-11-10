import { connection } from "next/server";
import { Fragment } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  Info,
} from "lucide-react";
import { AvailabilityForm } from "@/components/availability-form";
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
import { formatSchedulingWindow, localDateKey } from "@/lib/scheduling/time";
import { createClient } from "@/lib/supabase/server";
import { CancelSessionForm } from "@/components/cancel-session-form";
import { CancelSlotForm } from "@/components/cancel-slot-form";
import { ElasticAvailabilityForm } from "@/components/elastic-availability-form";

export const instant = false;

function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatDateKey(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function scheduleCopy(selection: ScheduleFilterSelection) {
  if (selection.filter === "all") {
    return { title: "All Published Slots", empty: "No availability has been created yet." };
  }
  if (selection.filter === "past") {
    return { title: "Past Slots Archive", empty: "No past availability was found in this period." };
  }
  if (selection.filter === "specific" && selection.date) {
    const date = formatDateKey(selection.date);
    return { title: `Slots for ${date}`, empty: `No slots created for ${date}. Create a session using the form.` };
  }
  return { title: "Upcoming Slots", empty: "No upcoming availability has been created yet." };
}

export default async function DoctorSchedulePage({
  searchParams,
}: {
    searchParams?: Promise<{ filter?: string; date?: string; weekday?: string; scheduleType?: string; created?: string; mode?: string }>;
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
  const copy = scheduleCopy(selection);

  const groups = visibleSlots.reduce<Array<{ date: string; sessions: Array<{ sessionId: string; slots: typeof visibleSlots }> }>>(
    (result, slot) => {
      const date = localDateKey(slot.slot_start_at, doctor.timezone);
      let dateGroup = result.find((group) => group.date === date);
      if (!dateGroup) {
        dateGroup = { date, sessions: [] };
        result.push(dateGroup);
      }
      let session = dateGroup.sessions.find((item) => item.sessionId === slot.availability_session_id);
      if (!session) {
        session = { sessionId: slot.availability_session_id, slots: [] };
        dateGroup.sessions.push(session);
      }
      session.slots.push(slot);
      return result;
    },
    [],
  );
  const initialMode = params?.mode === "custom" ? "custom" : "weekly";
  const selectedDate = selection.filter === "specific" ? selection.date ?? today : today;

  return (
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
              Clinic Availability Schedule
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Define your consulting hours, configure patient capacity per slot, and monitor live bookings.
            </p>
          </div>

        </div>

        <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Schedule controls</p>
              <p className="text-sm text-muted-foreground">Create availability or narrow the roster without losing your draft.</p>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <AvailabilityForm
                timezone={doctor.timezone}
                defaultDate={selectedDate}
                initialMode={initialMode}
              />
              <ScheduleFilterForm initialFilter={selection.filter} initialDate={selectedDate} initialWeekday={selection.weekday} initialScheduleType={selection.scheduleType} />
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border/70 bg-surface-muted/50 p-4 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <Info className="size-4 text-primary" />
              <span>Wave and Stream overview</span>
            </div>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              Wave creates duration-based appointment slots. Stream creates one shared arrival window with capacity across the full window.
            </p>
          </div>
        </section>

        {/* Notice of Creation */}
        {params?.created === "1" && <ScheduleCreatedNotice date={selectedDate} />}

        <Card id="schedule" className="min-w-0 overflow-hidden rounded-3xl border-border bg-card shadow-xs">
            <CardHeader className="border-b border-border/60 bg-surface-muted/30 p-5">
              <CardTitle className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-base font-bold text-[#1D2153]">
                <span>{copy.title}</span>
                <span className="whitespace-nowrap text-xs font-normal text-muted-foreground">
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
                    Use the Create availability action above to publish bookable appointment slots.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map((group) => (
                    <section key={group.date} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <CalendarCheck2 className="size-4 text-primary" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">{formatDateKey(group.date)}</h2>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-border/80">
                        <Table>
                          <TableHeader><TableRow className="bg-surface-muted/60 text-xs"><TableHead className="font-bold text-foreground">Schedule</TableHead><TableHead className="font-bold text-foreground">Time Window</TableHead><TableHead className="font-bold text-foreground">Capacity</TableHead><TableHead className="font-bold text-foreground">Status</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {group.sessions.map((session) => {
                              const activeSlots = session.slots.filter((slot) => slot.status === "available");
                              const fullyBooked = activeSlots.length > 0 && activeSlots.every((slot) => slot.allocated_count >= slot.capacity);
                              const first = session.slots[0];
                              const last = session.slots.at(-1) ?? first;
                              return (
                                <Fragment key={session.sessionId}>
                                  <TableRow className="bg-surface-muted/30">
                                    <TableCell colSpan={4}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs font-semibold">{first.scheduling_type === "stream" ? "Stream session" : "Wave session"}</span>
                                        <div className="flex flex-wrap items-center gap-2"><ElasticAvailabilityForm sessionId={session.sessionId} occurrenceDate={group.date} startTime={localTime(first.slot_start_at, doctor.timezone)} endTime={localTime(last.slot_end_at, doctor.timezone)} timezone={doctor.timezone} /><CancelSessionForm sessionId={session.sessionId} occurrenceDate={group.date} /></div>
                                      </div>
                                      {fullyBooked && <p role="status" className="mt-2 text-xs font-semibold text-destructive">All appointments are booked in this session.</p>}
                                    </TableCell>
                                  </TableRow>
                                  {session.slots.map((slot) => {
                                    const remaining = slot.capacity - slot.allocated_count;
                                    const isFull = remaining <= 0;
                                    const hasBookings = slot.allocated_count > 0;
                                    const isCancelled = slot.status !== "available";
                                    return <TableRow key={slot.id} className="text-xs hover:bg-surface-muted/30">
                                      <TableCell><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize text-[10px]">{slot.scheduling_type}</Badge>{slot.status === "available" && new Date(slot.slot_start_at).getTime() > Date.now() && <CancelSlotForm slotId={slot.id} label={formatSchedulingWindow(slot.slot_start_at, slot.slot_end_at, doctor.timezone, slot.scheduling_type)} />}</div></TableCell>
                                      <TableCell className="font-semibold text-foreground whitespace-nowrap">{formatSchedulingWindow(slot.slot_start_at, slot.slot_end_at, doctor.timezone, slot.scheduling_type)}</TableCell>
                                      <TableCell className="whitespace-nowrap"><div className="flex items-center gap-1.5 font-medium"><span className={isCancelled ? "text-muted-foreground" : isFull ? "text-destructive font-bold" : hasBookings ? "text-primary font-bold" : "text-muted-foreground"}>{slot.allocated_count} / {slot.capacity}</span><span className="text-[10px] text-muted-foreground">({remaining} left)</span></div></TableCell>
                                      <TableCell><Badge variant={isCancelled ? "outline" : isFull ? "destructive" : "secondary"} className="capitalize text-[10px]">{isCancelled ? "Cancelled" : isFull ? "Booked Out" : "Available"}</Badge></TableCell>
                                    </TableRow>;
                                  })}
                                </Fragment>
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
  );
}
