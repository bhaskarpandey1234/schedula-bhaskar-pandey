import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { formatSlotTime, getDoctorDetail, getDoctorSlots, groupSlotsByDate, isUuid } from "@/lib/discovery/directory";
import { PortalShell } from "@/components/portal-shell";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function DoctorDetailPage({ params }: { params: Promise<{ doctorId: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const { doctorId } = await params;
  if (!isUuid(doctorId)) notFound();
  const doctor = await getDoctorDetail(doctorId);
  if (!doctor) notFound();
  const slots = await getDoctorSlots(doctorId);
  const groups = groupSlotsByDate(slots, doctor.timezone);
  return <PortalShell role="patient" name={account.profile.full_name}><div className="grid gap-8">
    <div><Link href="/patient/doctors" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to doctor directory</Link><div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Doctor profile</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{doctor.full_name}</h1><p className="mt-3 text-lg text-primary">{doctor.specialty}</p></div><Badge variant="secondary">{doctor.experience_years} {doctor.experience_years === 1 ? "year" : "years"} experience</Badge></div></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle>About this doctor</CardTitle></CardHeader><CardContent className="grid gap-5"><p className="whitespace-pre-line text-muted-foreground">{doctor.biography}</p><div className="grid gap-3 border-t pt-5 text-sm"><p className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" />{doctor.clinic_name}</p><p className="flex items-center gap-2"><Clock className="size-4 text-primary" aria-hidden="true" />Appointments shown in {doctor.timezone}</p></div></CardContent></Card><Card><CardHeader><CardTitle>Next step</CardTitle><CardDescription>Review available times before booking opens in the next phase.</CardDescription></CardHeader><CardContent>{groups.length ? <Button asChild className="w-full"><Link href="#availability"><CalendarDays className="mr-2 size-4" aria-hidden="true" />View available times</Link></Button> : <p className="text-sm text-muted-foreground">There are no upcoming times in the next 30 days.</p>}</CardContent></Card></div>
    <section id="availability" className="scroll-mt-24"><div className="mb-4"><h2 className="text-2xl font-semibold">Upcoming availability</h2><p className="mt-1 text-sm text-muted-foreground">Available time windows for the next 30 days. Booking will be enabled in Phase 6.</p></div>{groups.length ? <div className="grid gap-4 md:grid-cols-2">{groups.map((group) => <Card key={group.date}><CardHeader><CardTitle className="text-base">{group.label}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{group.slots.map((slot) => <Badge key={slot.slot_id} variant="outline" className="px-3 py-1.5 text-sm">{formatSlotTime(slot.slot_start_at, doctor.timezone)} – {formatSlotTime(slot.slot_end_at, doctor.timezone)}</Badge>)}</CardContent></Card>)}</div> : <EmptyState title="No upcoming availability" description="This doctor does not have a bookable time window in the next 30 days. Please check back later or explore another profile." action={<Button asChild variant="outline"><Link href="/patient/doctors">Browse other doctors</Link></Button>} />}</section>
  </div></PortalShell>;
}
