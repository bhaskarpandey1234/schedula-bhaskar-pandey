"use client";

import { useActionState } from "react";
import { cancelDoctorSessionOccurrenceAction, type CancellationActionState } from "@/lib/appointments/actions";
import { Button } from "@/components/ui/button";

export function CancelSessionForm({ sessionId, occurrenceDate }: { sessionId: string; occurrenceDate: string }) {
  const [state, action, pending] = useActionState(cancelDoctorSessionOccurrenceAction, {} as CancellationActionState);
  return <form action={action} className="flex items-center gap-2"><input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="occurrenceDate" value={occurrenceDate} /><Button type="submit" variant="outline" size="sm" disabled={pending} onClick={(event) => { if (!window.confirm("Cancel this session occurrence and notify booked patients?")) event.preventDefault(); }}>{pending ? "Cancelling…" : state.success ? "Cancelled" : "Cancel session"}</Button>{state.error && <span className="text-xs text-destructive">{state.error}</span>}</form>;
}
