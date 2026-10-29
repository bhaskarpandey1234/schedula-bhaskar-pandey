import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getBookableSlot } from "@/lib/booking/queries";
import { formatSlotTime, isUuid } from "@/lib/discovery/directory";
import { BookingConfirmForm } from "@/components/booking-confirm-form";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function BookingConfirmPage({ params }: { params: Promise<{ doctorId: string; slotId: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const { doctorId, slotId } = await params;
  if (!isUuid(doctorId) || !isUuid(slotId)) notFound();
  const slot = await getBookableSlot(slotId);
  if (!slot || slot.doctor_id !== doctorId) notFound();
  return <PortalShell role="patient" name={account.profile.full_name}><div className="mx-auto grid max-w-2xl gap-6"><Link href={`/patient/doctors/${doctorId}/book/${slotId}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Edit visit reason</Link><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Review appointment</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Confirm your appointment.</h1><p className="mt-4 text-muted-foreground">Review the details below. The slot is held for 15 minutes while payment is completed.</p></div><Card><CardHeader><CardTitle>{slot.full_name} · {slot.specialty}</CardTitle><CardDescription>{slot.remaining_capacity} {slot.remaining_capacity === 1 ? "place" : "places"} remaining at review time</CardDescription></CardHeader><CardContent className="grid gap-5"><div className="grid gap-3 rounded-lg border p-4 text-sm"><p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" aria-hidden="true" />{new Intl.DateTimeFormat("en-US", { timeZone: slot.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(slot.slot_start_at))}</p><p className="flex items-center gap-2"><Clock className="size-4 text-primary" aria-hidden="true" />{formatSlotTime(slot.slot_start_at, slot.timezone)} – {formatSlotTime(slot.slot_end_at, slot.timezone)} ({slot.timezone})</p><p className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" />{slot.clinic_name}</p></div><BookingConfirmForm slotId={slotId} reason="" backHref={`/patient/doctors/${doctorId}/book/${slotId}`} amountMinor={slot.consultation_fee_minor} currency={slot.consultation_currency} /></CardContent></Card></div></PortalShell>;
}
