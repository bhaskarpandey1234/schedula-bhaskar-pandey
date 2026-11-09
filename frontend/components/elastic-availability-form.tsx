"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { previewElasticAvailabilityAction, applyElasticAvailabilityAction } from "@/lib/availability/elastic-actions";
import type { ElasticAssignment, ElasticPreview } from "@/lib/availability/elastic";

export function ElasticAvailabilityForm({ sessionId, occurrenceDate, startTime, endTime, timezone }: { sessionId: string; occurrenceDate: string; startTime: string; endTime: string; timezone: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);
  const [preview, setPreview] = useState<ElasticPreview | null>(null);
  const [assignments, setAssignments] = useState<ElasticAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function loadPreview() {
    setPending(true); setError(null);
    try { const result = await previewElasticAvailabilityAction({ sessionId, occurrenceDate, startTime: start, endTime: end }); setPreview(result.preview); setAssignments(result.assignments); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not preview this change."); } finally { setPending(false); }
  }

  async function confirm() {
    if (!preview) return;
    setPending(true); setError(null);
    try { await applyElasticAvailabilityAction({ sessionId, occurrenceDate, startTime: start, endTime: end, assignments }); setOpen(false); setPreview(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "The preview became stale. Please refresh it."); } finally { setPending(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setPreview(null); setError(null); } }}>
    <DialogTrigger><Button type="button" variant="outline" size="sm">Edit window</Button></DialogTrigger>
    <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>Edit availability window</DialogTitle><DialogDescription>Change this occurrence only. Wave duration and capacity stay unchanged; Stream keeps its shared patient allocations. Timezone: {timezone}.</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Start<input className="rounded-md border px-3 py-2" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="grid gap-1 text-sm">End<input className="rounded-md border px-3 py-2" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {!preview ? <Button type="button" onClick={loadPreview} disabled={pending}>{pending ? "Checking impact…" : "Preview change"}</Button> : <div className="space-y-3 rounded-lg border p-3 text-sm"><p className="font-semibold">{preview.classification === "shrink" ? "Schedule shrinking" : "Schedule expansion"}</p><p>{preview.appointments.length} booked appointment{preview.appointments.length === 1 ? "" : "s"} in this occurrence.</p>{preview.scheduling_type === "wave" && <div className="space-y-2">{assignments.map((assignment) => <label key={assignment.appointment_id} className="flex items-center justify-between gap-2 rounded border p-2"><span>{preview.appointments.find((appointment) => appointment.appointment_id === assignment.appointment_id)?.patient_name ?? "Booked patient"}</span><select className="rounded border px-2 py-1" value={assignment.target_slot_id ?? "cancelled"} onChange={(event) => setAssignments((current) => current.map((item) => item.appointment_id === assignment.appointment_id ? { ...item, target_slot_id: event.target.value === "cancelled" ? null : event.target.value, action: event.target.value === "cancelled" ? "cancelled" : "moved" } : item))}><option value="cancelled">Cancel + full refund</option>{preview.candidates.map((candidate) => <option key={candidate.slot_id} value={candidate.slot_id}>{new Date(candidate.start_at).toLocaleString()}</option>)}</select></label>)}</div>}{preview.scheduling_type === "stream" && <p className="text-muted-foreground">All booked patients keep their allocation and will receive the updated arrival window.</p>}{assignments.some((assignment) => assignment.action === "cancelled") && <p className="rounded-md bg-destructive/5 p-2 font-medium text-destructive">{assignments.filter((assignment) => assignment.action === "cancelled").length} appointment{assignments.filter((assignment) => assignment.action === "cancelled").length === 1 ? "" : "s"} will be cancelled and a full refund will be requested.</p>}<div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPreview(null)}>Back</Button><Button type="button" onClick={confirm} disabled={pending}>{pending ? "Applying…" : "Confirm change"}</Button></div></div>}
    </DialogContent>
  </Dialog>;
}
