"use client";

import { useActionState } from "react";
import { cancelDoctorSessionOccurrenceAction, type CancellationActionState } from "@/lib/appointments/actions";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function CancelSessionForm({ sessionId, occurrenceDate }: { sessionId: string; occurrenceDate: string }) {
  const [state, action, pending] = useActionState(cancelDoctorSessionOccurrenceAction, {} as CancellationActionState);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.success) setOpen(false); }, [state.success]);
  const formId = `cancel-session-${sessionId}-${occurrenceDate}`;
  return <form id={formId} action={action} className="flex items-center gap-2"><input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="occurrenceDate" value={occurrenceDate} /><Dialog open={open} onOpenChange={setOpen}><DialogTrigger><Button type="button" variant="outline" size="sm">{state.success ? "Cancelled" : "Cancel session"}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Cancel this session?</DialogTitle><DialogDescription>{occurrenceDate}. All unallocated slots on this date will be cancelled. Booked sessions or active payment holds are protected.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep session</Button><Button type="submit" form={formId} variant="destructive" disabled={pending}>{pending ? "Cancelling…" : "Cancel session"}</Button></DialogFooter></DialogContent></Dialog>{state.error && <span role="alert" className="text-xs text-destructive">{state.error}</span>}</form>;
}
