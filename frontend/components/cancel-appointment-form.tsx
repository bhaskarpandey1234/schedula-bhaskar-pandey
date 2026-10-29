"use client";

import { useActionState, useEffect, useState } from "react";
import { cancelAppointmentAction, type CancellationActionState } from "@/lib/appointments/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormErrorSummary } from "@/components/ui/form-feedback";

export function CancelAppointmentForm({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState(cancelAppointmentAction, {} as CancellationActionState);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.success) window.location.reload(); }, [state.success]);
  return <form action={action} className="grid gap-2 justify-items-start"><input type="hidden" name="appointmentId" value={appointmentId} /><Dialog open={open} onOpenChange={setOpen}><DialogTrigger><Button type="button" variant="outline" size="sm">Cancel appointment</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Cancel this appointment?</DialogTitle><DialogDescription>This action cannot be undone. The appointment time will become available again.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep appointment</Button><Button type="submit" variant="destructive" disabled={pending}>{pending ? "Cancelling…" : "Cancel appointment"}</Button></DialogFooter></DialogContent></Dialog><FormErrorSummary error={state.error} /></form>;
}
