"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BookingReasonForm({ doctorId, slotId }: { doctorId: string; slotId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  function continueToPreview() {
    const trimmed = reason.trim();
    if (trimmed.length > 500) { setError("Visit reason must be 500 characters or fewer."); return; }
    setError(undefined);
    sessionStorage.setItem(`schedula:booking-reason:${slotId}`, trimmed);
    router.push(`/patient/doctors/${doctorId}/book/${slotId}/confirm`);
  }
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); continueToPreview(); }}>
    <div className="grid gap-2"><Label htmlFor="reason">Visit reason <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="reason" value={reason} onChange={(event) => { setReason(event.target.value); setError(undefined); }} maxLength={500} aria-invalid={Boolean(error)} aria-describedby={error ? "booking-reason-error" : undefined} placeholder="Briefly tell the doctor what you would like to discuss." /><p className="text-xs text-muted-foreground">{reason.length}/500</p></div>
    {error && <p id="booking-reason-error" role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit">Review appointment</Button>
  </form>;
}
