"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publishPrescriptionAction, type ClinicalActionState } from "@/lib/clinical/actions";

export function PrescriptionForm({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState(publishPrescriptionAction, {} as ClinicalActionState);
  useEffect(() => { if (state.success) window.location.reload(); }, [state.success]);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Publish this prescription to the patient? Review all medication details first.")) event.preventDefault(); }} className="grid gap-3 rounded-xl border bg-card p-4"><input type="hidden" name="appointmentId" value={appointmentId} /><h3 className="font-semibold">Publish prescription</h3><div className="grid gap-3 sm:grid-cols-2"><Input name="medicationName" placeholder="Medication name" required maxLength={120} /><Input name="dosage" placeholder="Dosage" required maxLength={120} /><Input name="frequency" placeholder="Frequency" required maxLength={120} /><Input name="duration" placeholder="Duration" required maxLength={120} /></div><Input name="instructions" placeholder="Instructions (optional)" maxLength={500} /><Textarea name="notes" placeholder="Clinical notes (optional)" maxLength={1000} /><Button type="submit" disabled={pending}>{pending ? "Publishing…" : "Review and publish"}</Button>{state.error && <p className="text-xs text-destructive">{state.error}</p>}{state.success && <p className="text-xs text-emerald-600">Prescription published.</p>}</form>;
}
