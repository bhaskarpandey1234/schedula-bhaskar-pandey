"use client";

import { useActionState, useEffect, useState } from "react";
import { cancelDoctorSlotAction, type CancellationActionState } from "@/lib/appointments/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormErrorSummary } from "@/components/ui/form-feedback";
import { useFormStatus } from "react-dom";

function Submit({ form }: { form: string }) { const { pending } = useFormStatus(); return <Button type="submit" form={form} variant="destructive" disabled={pending}>{pending ? "Cancelling…" : "Cancel slot"}</Button>; }

export function CancelSlotForm({ slotId, label }: { slotId: string; label: string }) {
  const [state, action] = useActionState(cancelDoctorSlotAction, {} as CancellationActionState);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.success) setOpen(false); }, [state.success]);
  const formId = `cancel-slot-${slotId}`;
  return <form id={formId} action={action} className="grid gap-2 justify-items-start"><input type="hidden" name="slotId" value={slotId} /><Dialog open={open} onOpenChange={setOpen}><DialogTrigger><Button type="button" variant="outline" size="sm">Cancel slot</Button></DialogTrigger><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Cancel this slot?</DialogTitle><DialogDescription>{label}. This removes the slot from availability. Slots with bookings or active payment holds are protected.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep slot</Button><Submit form={formId} /></DialogFooter></DialogContent></Dialog><FormErrorSummary error={state.error} /></form>;
}
