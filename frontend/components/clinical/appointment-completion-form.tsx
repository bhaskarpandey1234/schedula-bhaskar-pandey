"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { completeDoctorAppointmentAction, type ClinicalActionState } from "@/lib/clinical/actions";

export function AppointmentCompletionForm({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState(completeDoctorAppointmentAction, {} as ClinicalActionState);
  useEffect(() => { if (state.success) window.location.reload(); }, [state.success]);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Mark this consultation as completed? This cannot be undone.")) event.preventDefault(); }} className="grid gap-2"><input type="hidden" name="appointmentId" value={appointmentId} /><Button type="submit" disabled={pending}>{pending ? "Completing…" : "Mark consultation completed"}</Button>{state.error && <p className="text-xs text-destructive">{state.error}</p>}{state.success && <p className="text-xs text-emerald-600">Consultation marked completed.</p>}</form>;
}
