"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { previewElasticAvailabilityAction, applyElasticAvailabilityAction } from "@/lib/availability/elastic-actions";
import { validateElasticWindow, type ElasticAssignment, type ElasticEditMode, type ElasticPreview } from "@/lib/availability/elastic";

export function ElasticAvailabilityForm({ sessionId, occurrenceDate, startTime, endTime, timezone }: { sessionId: string; occurrenceDate: string; startTime: string; endTime: string; timezone: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ElasticEditMode | null>(null);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);
  const [preview, setPreview] = useState<ElasticPreview | null>(null);
  const [assignments, setAssignments] = useState<ElasticAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function loadPreview() {
    const validationError = mode ? validateElasticWindow({ mode, oldStart: startTime, oldEnd: endTime, newStart: start, newEnd: end }) : "Choose expansion or shrink before editing the window.";
    if (validationError) { setError(validationError); return; }
    setPending(true); setError(null);
    try { const result = await previewElasticAvailabilityAction({ sessionId, occurrenceDate, startTime: start, endTime: end }); setPreview(result.preview); setAssignments(result.assignments); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not preview this change."); } finally { setPending(false); }
  }

  async function confirm() {
    if (!preview) return;
    setPending(true); setError(null);
    try { await applyElasticAvailabilityAction({ sessionId, occurrenceDate, startTime: start, endTime: end, assignments }); setOpen(false); setPreview(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "The preview became stale. Please refresh it."); } finally { setPending(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setMode(null); setStart(startTime); setEnd(endTime); setPreview(null); setAssignments([]); setError(null); } }}>
    <DialogTrigger><Button type="button" variant="outline" size="sm">Edit window</Button></DialogTrigger>
    <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>{mode ? "Edit availability window" : "Choose schedule change"}</DialogTitle><DialogDescription>{mode ? `Change this occurrence only. Current window: ${startTime}–${endTime}. Wave duration and capacity stay unchanged; Stream keeps its shared patient allocations. Timezone: ${timezone}.` : "Choose whether you want to add time to, or remove time from, this availability window."}</DialogDescription></DialogHeader>
      {!mode ? <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Availability change type">
        <button type="button" aria-pressed={mode === "expansion"} className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setMode("expansion"); setError(null); }}>
          <span className="font-semibold">Expand availability</span><span className="mt-1 block text-sm text-muted-foreground">Add time before or after the current window.</span>
        </button>
        <button type="button" aria-pressed={mode === "shrink"} className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setMode("shrink"); setError(null); }}>
          <span className="font-semibold">Shrink availability</span><span className="mt-1 block text-sm text-muted-foreground">Remove time; booked appointments may need rescheduling or refunds.</span>
        </button>
      </div> : <>
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm"><span>Mode: <strong>{mode === "expansion" ? "Expansion" : "Shrink"}</strong></span><Button type="button" variant="ghost" size="sm" onClick={() => { setMode(null); setPreview(null); setAssignments([]); setError(null); }}>Change mode</Button></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Start<input className="rounded-md border px-3 py-2" type="time" value={start} onChange={(event) => { setStart(event.target.value); setPreview(null); }} /></label><label className="grid gap-1 text-sm">End<input className="rounded-md border px-3 py-2" type="time" value={end} onChange={(event) => { setEnd(event.target.value); setPreview(null); }} /></label></div>
      </>}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {mode && (!preview ? <Button type="button" onClick={loadPreview} disabled={pending}>{pending ? "Checking impact…" : "Preview change"}</Button> : <div className="space-y-3 rounded-lg border p-3 text-sm"><p className="font-semibold">{preview.classification === "shrink" ? "Schedule shrinking" : "Schedule expansion"}</p><p>{preview.appointments.length} booked appointment{preview.appointments.length === 1 ? "" : "s"} in this occurrence.</p>{preview.scheduling_type === "wave" && <div className="space-y-2">{assignments.map((assignment) => <label key={assignment.appointment_id} className="flex items-center justify-between gap-2 rounded border p-2"><span>{preview.appointments.find((appointment) => appointment.appointment_id === assignment.appointment_id)?.patient_name ?? "Booked patient"}</span><select className="rounded border px-2 py-1" value={assignment.target_slot_id ?? "cancelled"} onChange={(event) => setAssignments((current) => current.map((item) => item.appointment_id === assignment.appointment_id ? { ...item, target_slot_id: event.target.value === "cancelled" ? null : event.target.value, action: event.target.value === "cancelled" ? "cancelled" : "moved" } : item))}><option value="cancelled">Cancel + full refund</option>{preview.candidates.map((candidate) => <option key={candidate.slot_id} value={candidate.slot_id}>{new Date(candidate.start_at).toLocaleString()}</option>)}</select></label>)}</div>}{preview.scheduling_type === "stream" && <p className="text-muted-foreground">All booked patients keep their allocation and will receive the updated arrival window.</p>}{assignments.some((assignment) => assignment.action === "cancelled") && <p className="rounded-md bg-destructive/5 p-2 font-medium text-destructive">{assignments.filter((assignment) => assignment.action === "cancelled").length} appointment{assignments.filter((assignment) => assignment.action === "cancelled").length === 1 ? "" : "s"} will be cancelled and a full refund will be requested.</p>}<div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPreview(null)}>Back</Button><Button type="button" onClick={confirm} disabled={pending}>{pending ? "Applying…" : "Confirm change"}</Button></div></div>)}
    </DialogContent>
  </Dialog>;
}
