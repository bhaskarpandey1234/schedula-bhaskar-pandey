"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { bookAppointmentAction, type BookingActionState } from "@/lib/booking/actions";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

export function BookingConfirmForm({ slotId, reason, backHref }: { slotId: string; reason: string; backHref: string }) {
  const [state, action, pending] = useActionState(bookAppointmentAction, {} as BookingActionState);
  const [currentReason, setCurrentReason] = useState(reason);
  useEffect(() => { setCurrentReason(sessionStorage.getItem(`schedula:booking-reason:${slotId}`) ?? reason); }, [slotId, reason]);
  return <form action={action} noValidate className="grid gap-3"><input type="hidden" name="slotId" value={slotId} /><input type="hidden" name="reason" value={currentReason} />{currentReason && <p className="rounded-md bg-muted p-3 text-sm">Visit reason: {currentReason}</p>}<FormErrorSummary error={state.error} /><div className="flex flex-wrap gap-3"><Button asChild type="button" variant="outline"><Link href={backHref}>Edit reason</Link></Button><Button type="submit" disabled={pending}>{pending ? "Confirming…" : "Confirm appointment"}</Button></div></form>;
}
