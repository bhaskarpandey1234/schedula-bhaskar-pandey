"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookingConfirmForm } from "@/components/booking-confirm-form";
import { formatLocalDate, formatLocalSlotRange } from "@/lib/scheduling/time";
import type { DoctorDetailRecord, DoctorSlot } from "@/lib/discovery/types";

export function SlotBookingDialog({ doctor, slots, role }: { doctor: DoctorDetailRecord; slots: DoctorSlot[]; role?: "patient" | "doctor" }) {
  const [selected, setSelected] = useState<DoctorSlot | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const close = () => { setSelected(null); setStep(1); setReason(""); setError(undefined); };
  const open = (slot: DoctorSlot) => { setSelected(slot); setStep(1); };
  const continueToConfirm = () => { if (reason.trim().length > 500) { setError("Visit reason must be 500 characters or fewer."); return; } setError(undefined); setStep(2); };
  const fee = doctor.consultation_fee_minor;
  return <>
    <div className="flex flex-wrap gap-2">{slots.map((slot) => role === "patient" && fee != null ? <Button key={slot.slot_id} type="button" variant="outline" className="h-auto rounded-xl px-3 py-2 text-xs" onClick={() => open(slot)}><span>{formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, doctor.timezone)}</span><span className="ml-1.5 text-[10px] opacity-75">({slot.remaining_capacity} left)</span></Button> : <Button key={slot.slot_id} asChild variant="outline" className="h-auto rounded-xl px-3 py-2 text-xs"><Link href={role === "doctor" ? "/doctor" : `/auth/login?next=${encodeURIComponent(`/doctors/${doctor.doctor_id}`)}`}><span>{formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, doctor.timezone)}</span><span className="ml-1.5 text-[10px] opacity-75">({slot.remaining_capacity} left)</span></Link></Button>)}</div>
    <Dialog open={Boolean(selected)} onOpenChange={(value) => { if (!value) close(); }}><DialogContent><DialogHeader><DialogTitle>{step === 1 ? "Review appointment" : "Confirm appointment"}</DialogTitle><DialogDescription>Step {step} of 2 · {step === 1 ? "Review the slot and add an optional visit reason." : "Confirm the details before opening secure Razorpay Checkout."}</DialogDescription></DialogHeader>{selected && <div className="grid gap-4"><div className="grid gap-2 rounded-lg border p-4 text-sm"><p className="font-medium">{doctor.full_name} · {doctor.specialty}</p><p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" />{formatLocalDate(selected.slot_start_at, doctor.timezone)}</p><p className="flex items-center gap-2"><Clock className="size-4 text-primary" />{formatLocalSlotRange(selected.slot_start_at, selected.slot_end_at, doctor.timezone)} ({doctor.timezone})</p><p className="flex items-center gap-2"><MapPin className="size-4 text-primary" />{doctor.clinic_name}</p><p className="font-medium">Consultation fee: ₹{((fee ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>{step === 1 ? <><div className="grid gap-2"><Label htmlFor="dialog-reason">Visit reason <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="dialog-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError(undefined); }} maxLength={500} placeholder="Briefly tell the doctor what you would like to discuss." />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div><Button type="button" onClick={continueToConfirm}>Continue to confirmation</Button></> : <><div className="rounded-lg bg-primary/5 p-3 text-sm">The slot is held for 15 minutes when payment starts. A successful payment confirms the appointment.</div><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setStep(1)}><ArrowLeft className="size-4" />Back</Button><BookingConfirmForm slotId={selected.slot_id} reason={reason} backHref={`/doctors/${doctor.doctor_id}`} amountMinor={fee} currency={doctor.consultation_currency ?? "INR"} /></div></>}</div>}</DialogContent></Dialog>
  </>;
}
