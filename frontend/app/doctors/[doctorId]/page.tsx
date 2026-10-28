import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { PortalShell } from "@/components/portal-shell";
import { getCurrentAccount } from "@/lib/auth/guards";
import { formatSlotTime, getPublicDoctorDetail, getPublicDoctorSlots, groupSlotsByDate, isUuid } from "@/lib/discovery/directory";

export const instant = false;

export default async function PublicDoctorDetailPage({ params }: { params: Promise<{ doctorId: string }> }) {
  await connection();
  const { doctorId } = await params;
  if (!isUuid(doctorId)) notFound();
  const [account, doctor, slots] = await Promise.all([getCurrentAccount(), getPublicDoctorDetail(doctorId), getPublicDoctorSlots(doctorId)]);
  if (!doctor) notFound();
  const role = account?.onboardingComplete && account.profile?.full_name ? account.profile.role : undefined;
  const groups = groupSlotsByDate(slots, doctor.timezone);
  const bookingHref = (slotId: string) => `/patient/doctors/${doctorId}/book/${slotId}`;
  const callToAction = (slotId: string) => {
    if (!role) return `/auth/login?next=${encodeURIComponent(bookingHref(slotId))}`;
    return role === "patient" ? bookingHref(slotId) : "/doctor";
  };
  return <PortalShell role={role} name={account?.profile?.full_name ?? undefined}><div className="grid gap-7">
    <Link href="/doctors" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />All doctors</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Doctor profile</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{doctor.full_name}</h1><p className="mt-2 text-lg font-medium text-primary">{doctor.specialty}</p></div><Badge variant="secondary">{doctor.experience_years} years experience</Badge></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Card><CardHeader><CardTitle>About</CardTitle></CardHeader><CardContent className="grid gap-5"><p className="whitespace-pre-line text-muted-foreground">{doctor.biography}</p><div className="grid gap-3 border-t pt-5 text-sm"><p className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" />{doctor.clinic_name}</p><p className="flex items-center gap-2"><Clock className="size-4 text-primary" aria-hidden="true" />Times shown in {doctor.timezone}</p></div></CardContent></Card><Card><CardHeader><CardTitle>Available appointments</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Choose an available time below to continue.</p></CardContent></Card></div>
    <section id="availability" className="scroll-mt-24"><div className="mb-4 flex items-center gap-2"><CalendarDays className="size-5 text-primary" aria-hidden="true" /><h2 className="text-2xl font-semibold">Upcoming availability</h2></div>{groups.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.map((group) => <Card key={group.date}><CardHeader><CardTitle className="text-base">{group.label}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{group.slots.map((slot) => <Button key={slot.slot_id} asChild variant="outline" className="h-auto justify-between gap-3 px-3 py-2"><Link href={callToAction(slot.slot_id)}><span>{formatSlotTime(slot.slot_start_at, doctor.timezone)} – {formatSlotTime(slot.slot_end_at, doctor.timezone)}</span><span className="text-xs text-muted-foreground">{slot.remaining_capacity} left</span></Link></Button>)}</CardContent></Card>)}</div> : <EmptyState title="No upcoming availability" description="This doctor does not have a bookable time in the next 30 days." action={<Button asChild variant="outline"><Link href="/doctors">Browse doctors</Link></Button>} />}</section>
  </div></PortalShell>;
}
