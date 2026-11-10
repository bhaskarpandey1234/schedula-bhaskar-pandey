"use client";

import { useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { previewElasticAvailabilityAction, applyElasticAvailabilityAction } from "@/lib/availability/elastic-actions";
import { availableElasticCandidateDates, availableElasticCandidates, elasticCandidatesForDate, suggestElasticAssignments, validateElasticWindow, type ElasticAssignment, type ElasticEditMode, type ElasticPreview } from "@/lib/availability/elastic";
import { formatDateKey, formatLocalDate, formatLocalSlotRange, formatSchedulingWindow, localDateKey } from "@/lib/scheduling/time";

export function ElasticAvailabilityForm({ sessionId, occurrenceDate, startTime, endTime, timezone }: { sessionId: string; occurrenceDate: string; startTime: string; endTime: string; timezone: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ElasticEditMode | null>(null);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);
  const [preview, setPreview] = useState<ElasticPreview | null>(null);
  const [assignments, setAssignments] = useState<ElasticAssignment[]>([]);
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setMode(null);
    setStart(startTime);
    setEnd(endTime);
    setPreview(null);
    setAssignments([]);
    setSelectedDates({});
    setError(null);
  }

  async function loadPreview() {
    const validationError = mode ? validateElasticWindow({ mode, oldStart: startTime, oldEnd: endTime, newStart: start, newEnd: end }) : "Choose expansion or shrink before editing the window.";
    if (validationError) { setError(validationError); return; }
    setPending(true);
    setError(null);
    try {
      const result = await previewElasticAvailabilityAction({ sessionId, occurrenceDate, startTime: start, endTime: end });
      if ("error" in result) { setError(result.error); return; }
      setPreview(result.preview);
      setAssignments(result.assignments);
      setSelectedDates(Object.fromEntries(result.assignments.flatMap((assignment) => {
        const candidate = result.preview.candidates.find((item) => item.slot_id === assignment.target_slot_id);
        return candidate ? [[assignment.appointment_id, localDateKey(candidate.start_at, result.preview.timezone)]] : [];
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not preview this change.");
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    if (assignments.some((assignment) => assignment.action === "moved" && !assignment.target_slot_id)) {
      setError("Choose an available time for every booking you want to move.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await applyElasticAvailabilityAction({ sessionId, occurrenceDate, startTime: start, endTime: end, assignments });
      setOpen(false);
      reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The preview became stale. Please refresh it.");
    } finally {
      setPending(false);
    }
  }

  function chooseMode(nextMode: ElasticEditMode) {
    setMode(nextMode);
    setPreview(null);
    setAssignments([]);
    setSelectedDates({});
    setError(null);
  }

  function updateAssignment(appointmentId: string, next: Pick<ElasticAssignment, "action" | "target_slot_id">) {
    setAssignments((current) => current.map((item) => item.appointment_id === appointmentId
      ? { ...item, ...next }
      : item));
  }

  function chooseMove(appointmentId: string, candidates: ElasticPreview["candidates"]) {
    const recommended = candidates[0];
    if (!recommended) return;
    updateAssignment(appointmentId, { action: "moved", target_slot_id: recommended.slot_id });
    setSelectedDates((current) => ({ ...current, [appointmentId]: localDateKey(recommended.start_at, timezone) }));
  }

  const close = (value: boolean) => {
    setOpen(value);
    if (!value) reset();
  };
  const recommendations = preview ? suggestElasticAssignments(preview) : [];
  const hasIncompleteMoves = assignments.some((assignment) => assignment.action === "moved" && !assignment.target_slot_id);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger><Button type="button" variant="outline" size="sm">Edit window</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode ? "Edit availability window" : "Choose schedule change"}</DialogTitle>
          <DialogDescription>
            {mode ? "Update this occurrence only. Review the impact before applying the change." : "Choose how you want to change this availability window."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-2 rounded-xl border border-border/80 bg-surface-muted/40 p-4" aria-label="Current availability window">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary"><CalendarClock className="size-4" aria-hidden="true" />Current window</div>
            <div className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-4">
              <p><span className="text-muted-foreground">Date:</span> {occurrenceDate}</p>
              <p><span className="text-muted-foreground">Time:</span> {startTime} – {endTime}</p>
              <p className="sm:col-span-2"><span className="text-muted-foreground">Timezone:</span> {timezone}</p>
            </div>
          </section>

          {!mode ? (
            <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Availability change type">
              <button type="button" aria-pressed={false} className="grid gap-2 rounded-xl border border-border/80 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => chooseMode("expansion")}>
                <span className="font-semibold">Expand availability</span>
                <span className="text-sm leading-5 text-muted-foreground">Add time before or after the current window.</span>
              </button>
              <button type="button" aria-pressed={false} className="grid gap-2 rounded-xl border border-border/80 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => chooseMode("shrink")}>
                <span className="font-semibold">Shrink availability</span>
                <span className="text-sm leading-5 text-muted-foreground">Remove time; booked appointments may need a new slot or refund.</span>
              </button>
            </div>
          ) : (
            <section className="grid gap-4" aria-label="New availability window">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-sm">Editing mode: <strong>{mode === "expansion" ? "Expand" : "Shrink"}</strong></p>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setMode(null); setPreview(null); setAssignments([]); setSelectedDates({}); setError(null); }}>Change mode</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="elastic-start-time">Start time</Label><Input id="elastic-start-time" name="elastic-start-time" aria-label="New availability start time" type="time" value={start} onChange={(event) => { setStart(event.target.value); setPreview(null); setAssignments([]); setSelectedDates({}); setError(null); }} /></div>
                <div className="grid gap-2"><Label htmlFor="elastic-end-time">End time</Label><Input id="elastic-end-time" name="elastic-end-time" aria-label="New availability end time" type="time" value={end} onChange={(event) => { setEnd(event.target.value); setPreview(null); setAssignments([]); setSelectedDates({}); setError(null); }} /></div>
              </div>
            </section>
          )}

          {error && <p role="alert" aria-live="assertive" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-5 text-destructive">{error}</p>}

          {mode && !preview && <DialogFooter><Button type="button" variant="outline" onClick={() => { setMode(null); setError(null); }}>Back</Button><Button type="button" onClick={loadPreview} disabled={pending}>{pending ? "Checking impact…" : "Preview change"}</Button></DialogFooter>}

          {preview && <section className="grid gap-4 rounded-xl border border-border/80 bg-background p-4" aria-label="Availability change preview">
            <div className="grid gap-1">
              <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-primary" aria-hidden="true" />Review change impact</div>
              <p className="text-sm text-muted-foreground">These {preview.appointments.length} booking{preview.appointments.length === 1 ? "" : "s"} are affected by this change.</p>
            </div>
            <div className="grid gap-2 rounded-lg bg-surface-muted/50 p-3 text-sm">
              <p className="font-medium">New window</p>
              <p className="text-muted-foreground">{formatLocalDate(preview.new_start_at, preview.timezone)}</p>
              <p className="flex items-center gap-2 text-muted-foreground"><Clock3 className="size-4 text-primary" aria-hidden="true" />{formatLocalSlotRange(preview.new_start_at, preview.new_end_at, preview.timezone)}</p>
              <p className="text-xs text-muted-foreground">{preview.classification === "shrink" ? "The removed time is outside the new window." : "The new time will be added to this occurrence."}</p>
            </div>
            {preview.affected_slots.length > 0 && <div className="grid gap-2"><p className="text-sm font-semibold">Affected slots</p><div className="grid gap-2 sm:grid-cols-2">{preview.affected_slots.map((slot) => <div key={slot.slot_id} className="rounded-lg border border-border/70 px-3 py-2 text-sm"><p className="font-medium">{formatLocalDate(slot.start_at, preview.timezone)}</p><p>{formatSchedulingWindow(slot.start_at, slot.end_at, preview.timezone, preview.scheduling_type)}</p><p className="text-xs text-muted-foreground">{slot.allocated_count} of {slot.capacity} booked</p></div>)}</div></div>}
            {preview.scheduling_type === "wave" && assignments.length > 0 && <div className="grid gap-3"><div><p className="text-sm font-semibold">Choose an outcome for each booking</p><p className="text-xs text-muted-foreground">We recommend the earliest available slot. You can choose another available date and time, or cancel with a full refund.</p></div>{assignments.map((assignment) => {
              const appointment = preview.appointments.find((item) => item.appointment_id === assignment.appointment_id);
              if (!appointment) return null;
              const candidates = availableElasticCandidates(preview, assignments, assignment.appointment_id);
              const target = preview.candidates.find((candidate) => candidate.slot_id === assignment.target_slot_id);
              const selectedDate = selectedDates[assignment.appointment_id] ?? (target ? localDateKey(target.start_at, preview.timezone) : "");
              const availableDates = availableElasticCandidateDates(candidates, preview.timezone);
              const dateSlots = selectedDate ? elasticCandidatesForDate(candidates, selectedDate, preview.timezone) : [];
              const recommendation = recommendations.find((item) => item.appointment_id === assignment.appointment_id);
              const isRecommended = assignment.action === "moved" && recommendation?.target_slot_id === assignment.target_slot_id;
              const canMove = candidates.length > 0 || assignment.action === "moved";
              return <article key={assignment.appointment_id} className="grid gap-4 rounded-xl border border-border/70 p-4" aria-label={`Reassign booking on ${formatLocalDate(appointment.start_at, preview.timezone)}`}>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{appointment.patient_name ?? "Booked patient"}</p><p className="mt-1 text-sm text-muted-foreground">Current booking: {formatLocalDate(appointment.start_at, preview.timezone)} · {formatLocalSlotRange(appointment.start_at, appointment.end_at, preview.timezone)}</p></div>
                <fieldset className="grid gap-2"><legend className="text-sm font-medium">Choose an outcome</legend><div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant={assignment.action === "moved" ? "default" : "outline"} className="h-auto justify-start whitespace-normal px-3 py-3 text-left" aria-pressed={assignment.action === "moved"} disabled={!canMove} onClick={() => chooseMove(assignment.appointment_id, candidates)}><span className="grid gap-0.5"><span>Move booking</span>{isRecommended && target && <span className="text-xs font-normal opacity-80">Recommended: {formatLocalDate(target.start_at, preview.timezone)} · {formatLocalSlotRange(target.start_at, target.end_at, preview.timezone)}</span>}</span></Button><Button type="button" variant={assignment.action === "cancelled" ? "destructive" : "outline"} className="h-auto justify-start px-3 py-3" aria-pressed={assignment.action === "cancelled"} onClick={() => updateAssignment(assignment.appointment_id, { action: "cancelled", target_slot_id: null })}>Cancel + full refund</Button></div></fieldset>
                {assignment.action === "moved" && <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]"><div className="grid gap-2"><p className="text-sm font-medium">Choose a new date</p><Calendar value={selectedDate || undefined} onChange={(date) => { setSelectedDates((current) => ({ ...current, [assignment.appointment_id]: date })); updateAssignment(assignment.appointment_id, { action: "moved", target_slot_id: null }); }} availableDates={availableDates} restrictToAvailableDates todayDate={localDateKey(new Date(), preview.timezone)} /><p className="text-xs text-muted-foreground">Only dates with an available slot can be selected.</p></div><section className="grid content-start gap-2" aria-label="Available replacement slots"><div><p className="text-sm font-medium">Available slots{selectedDate ? ` on ${formatDateKey(selectedDate)}` : ""}</p><p className="text-xs text-muted-foreground">Choose where to move this booking.</p></div>{selectedDate ? <div className="grid gap-2 sm:grid-cols-2">{dateSlots.map((candidate) => <Button key={candidate.slot_id} type="button" variant={assignment.target_slot_id === candidate.slot_id ? "default" : "outline"} className="h-auto justify-start px-3 py-3 text-left" aria-pressed={assignment.target_slot_id === candidate.slot_id} onClick={() => { setSelectedDates((current) => ({ ...current, [assignment.appointment_id]: localDateKey(candidate.start_at, preview.timezone) })); updateAssignment(assignment.appointment_id, { action: "moved", target_slot_id: candidate.slot_id }); }}><span className="grid gap-0.5"><span>{formatLocalSlotRange(candidate.start_at, candidate.end_at, preview.timezone)}</span><span className="text-xs font-normal opacity-80">{candidate.remaining_capacity} {candidate.remaining_capacity === 1 ? "place" : "places"} available</span></span></Button>)}</div> : <p className="rounded-lg bg-surface-muted/50 px-3 py-2 text-sm text-muted-foreground">Choose an available date to see its slots.</p>}</section></div>}
              </article>;
            })}</div>}
            {preview.scheduling_type === "stream" && <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">All bookings keep their allocation and receive the updated arrival window.</p>}
            {assignments.some((assignment) => assignment.action === "cancelled") && <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">{assignments.filter((assignment) => assignment.action === "cancelled").length} booking{assignments.filter((assignment) => assignment.action === "cancelled").length === 1 ? "" : "s"} will be cancelled and refunded.</p>}
            {hasIncompleteMoves && <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">Choose a replacement time or select cancel + full refund for each affected booking.</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => { setPreview(null); setAssignments([]); setError(null); }}><ArrowLeft className="size-4" />Back</Button><Button type="button" onClick={confirm} disabled={pending || hasIncompleteMoves}>{pending ? "Applying change…" : "Confirm change"}<MoveRight className="size-4" /></Button></DialogFooter>
          </section>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
