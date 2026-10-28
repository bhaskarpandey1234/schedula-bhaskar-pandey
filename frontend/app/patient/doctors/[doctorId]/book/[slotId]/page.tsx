import Link from "next/link";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getBookableSlot } from "@/lib/booking/queries";
import { formatSlotTime, isUuid } from "@/lib/discovery/directory";
import { BookingReasonForm } from "@/components/booking-reason-form";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function BookingPage({ params }: { params: Promise<{ doctorId: string; slotId: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const { doctorId, slotId } = await params;
  if (!isUuid(doctorId) || !isUuid(slotId)) notFound();
  const slot = await getBookableSlot(slotId);
  if (!slot || slot.doctor_id !== doctorId) notFound();
  return <PortalShell role="patient" name={account.profile.full_name}><div className="mx-auto grid max-w-2xl gap-6"><Link href={`/doctors/${doctorId}#availability`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to availability</Link><div><h1 className="text-3xl font-semibold tracking-tight">Tell us how we can help.</h1><p className="mt-2 text-muted-foreground">Add an optional short reason, then review your appointment.</p></div><Card><CardHeader><CardTitle>{slot.full_name} · {slot.specialty}</CardTitle><CardDescription>{slot.remaining_capacity} {slot.remaining_capacity === 1 ? "place" : "places"} remaining</CardDescription></CardHeader><CardContent className="grid gap-5"><div className="grid gap-2 border-b pb-5 text-sm"><p className="flex items-center gap-2"><Clock className="size-4 text-primary" aria-hidden="true" />{formatSlotTime(slot.slot_start_at, slot.timezone)} – {formatSlotTime(slot.slot_end_at, slot.timezone)} ({slot.timezone})</p><p className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" />{slot.clinic_name}</p></div><BookingReasonForm doctorId={doctorId} slotId={slotId} /></CardContent></Card><Button asChild variant="ghost" className="justify-start"><Link href={`/doctors/${doctorId}`}>Cancel</Link></Button></div></PortalShell>;
}
