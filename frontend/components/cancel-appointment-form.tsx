"use client";

import { useActionState, useEffect } from "react";
import { cancelAppointmentAction, type CancellationActionState } from "@/lib/appointments/actions";
import { Button } from "@/components/ui/button";

export function CancelAppointmentForm({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState(cancelAppointmentAction, {} as CancellationActionState);
  useEffect(() => {
    if (state.success) window.location.reload();
  }, [state.success]);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Cancel this appointment?")) event.preventDefault(); }} className="grid gap-2 justify-items-start">
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Cancelling…" : "Cancel appointment"}</Button>
    {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
  </form>;
}
