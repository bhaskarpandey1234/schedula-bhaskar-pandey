import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  Star,
  Stethoscope,
} from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { PortalShell } from "@/components/portal-shell";
import { getDoctorPortrait } from "@/components/doctor-card-proposals";
import { getCurrentAccount } from "@/lib/auth/guards";
import {
  formatSlotTime,
  getPublicDoctorDetail,
  getPublicDoctorSlots,
  groupSlotsByDate,
  isUuid,
} from "@/lib/discovery/directory";

export const instant = false;

export default async function PublicDoctorDetailPage({
  params,
}: {
  params: Promise<{ doctorId: string }>;
}) {
  await connection();
  const { doctorId } = await params;
  if (!isUuid(doctorId)) notFound();

  const [account, doctor, slots] = await Promise.all([
    getCurrentAccount(),
    getPublicDoctorDetail(doctorId),
    getPublicDoctorSlots(doctorId),
  ]);
  if (!doctor) notFound();

  const role =
    account?.onboardingComplete && account.profile?.full_name
      ? account.profile.role
      : undefined;
  const groups = groupSlotsByDate(slots, doctor.timezone);
  const bookingHref = (slotId: string) =>
    `/patient/doctors/${doctorId}/book/${slotId}`;
  const callToAction = (slotId: string) => {
    if (!role)
      return `/auth/login?next=${encodeURIComponent(bookingHref(slotId))}`;
    return role === "patient" ? bookingHref(slotId) : "/doctor";
  };

  const portrait = getDoctorPortrait(doctor);

  return (
    <PortalShell role={role} name={account?.profile?.full_name ?? undefined}>
      <div className="grid gap-8 max-w-6xl mx-auto">
        {/* Navigation Breadcrumb */}
        <Link
          href="/doctors"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to all doctors
        </Link>

        {/* Practo-Style Doctor Header Card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Physician Portrait */}
            <div className="relative size-32 sm:size-36 shrink-0 overflow-hidden rounded-2xl border-2 border-primary/20 shadow-md bg-slate-100">
              <Image
                src={portrait}
                alt={doctor.full_name}
                fill
                unoptimized
                className="object-cover object-top"
                sizes="150px"
              />
            </div>

            {/* Doctor Info & Credentials */}
            <div className="flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  {doctor.specialty}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  Practo Verified
                </span>
                <Badge variant="secondary" className="text-xs">
                  {doctor.experience_years} years practice
                </Badge>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1D2153]">
                {doctor.full_name}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600">
                <p className="flex items-center gap-1.5 font-medium">
                  <MapPin className="size-4 text-primary shrink-0" aria-hidden="true" />
                  {doctor.clinic_name}
                </p>
                <span className="hidden sm:inline text-slate-300">•</span>
                <p className="flex items-center gap-1.5 font-medium">
                  <Clock className="size-4 text-primary shrink-0" aria-hidden="true" />
                  {doctor.timezone}
                </p>
              </div>

              {/* Patient Trust Metrics (Practo Style) */}
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                  <Star className="size-3.5 fill-emerald-600 text-emerald-600" />
                  <span>98% Patient Satisfaction</span>
                </div>
                <div className="flex items-center gap-1 text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  <span>₹600 Consultation Fee</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Doctor Biography & Clinical Overview */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="rounded-2xl border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-[#1D2153]">
                About Dr. {doctor.full_name.replace(/^(Dr\.?)\s+/i, "")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                {doctor.biography}
              </p>

              <div className="grid gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 text-primary shrink-0" />
                  <span>Available for confirmed in-clinic consultation & follow-up visits.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span>Digital prescription provided immediately after consultation.</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clinic & Instant Booking Card */}
          <Card className="rounded-2xl border-slate-200 bg-slate-50/70">
            <CardHeader>
              <CardTitle className="text-base font-bold text-[#1D2153]">
                Clinic Consultation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-800">{doctor.clinic_name}</p>
                <p className="text-[11px] text-slate-500">Instant slot confirmation on Schedula</p>
                <p className="text-primary font-bold pt-1">₹600 at clinic</p>
              </div>

              <p className="text-slate-500 leading-relaxed">
                Choose an available slot from the calendar below to book your verified appointment.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Available Appointment Slots Section */}
        <section id="availability" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-xl font-bold text-[#1D2153]">
              Available Appointment Slots
            </h2>
          </div>

          {groups.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <Card key={group.date} className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                      <span>{group.label}</span>
                      <span className="text-xs font-normal text-slate-500">
                        {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {group.slots.map((slot) => (
                      <Button
                        key={slot.slot_id}
                        asChild
                        variant="outline"
                        className="h-auto border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground font-medium text-xs px-3 py-2 rounded-xl transition-all"
                      >
                        <Link href={callToAction(slot.slot_id)}>
                          <span>
                            {formatSlotTime(slot.slot_start_at, doctor.timezone)}
                          </span>
                          <span className="ml-1.5 text-[10px] opacity-75">
                            ({slot.remaining_capacity} left)
                          </span>
                        </Link>
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No upcoming availability"
              description="This doctor does not currently have open appointment slots."
              action={
                <Button asChild variant="outline">
                  <Link href="/doctors">Browse other doctors</Link>
                </Button>
              }
            />
          )}
        </section>
      </div>
    </PortalShell>
  );
}
