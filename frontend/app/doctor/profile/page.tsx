import { connection } from "next/server";
import Link from "next/link";
import {
  Clock,
  Coins,
  MapPin,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { DoctorProfileForm } from "@/components/doctor-profile-form";
import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const instant = false;

export default async function DoctorProfilePage() {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor, error } = await supabase
    .from("doctors")
    .select("phone, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor")
    .eq("id", account.user.id)
    .maybeSingle();

  if (error) {
    return (
      <PortalShell role="doctor" name={account.profile.full_name}>
        <Card className="rounded-2xl border-destructive/20 p-6 text-center space-y-3">
          <CardTitle>Profile temporarily unavailable</CardTitle>
          <CardContent className="text-sm text-muted-foreground">
            <p>We could not load your professional details. Please refresh and try again.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/doctor/profile">Retry Profile</Link>
            </Button>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  if (!doctor) {
    return (
      <PortalShell role="doctor" name={account.profile.full_name}>
        <Card className="rounded-2xl border-amber-300 bg-amber-50/50 p-6 text-center space-y-3">
          <CardTitle>Complete your professional profile</CardTitle>
          <CardContent className="text-sm text-muted-foreground">
            <p>Your doctor profile has not been set up yet.</p>
            <Button asChild className="mt-4">
              <Link href="/onboarding">Open Profile Setup</Link>
            </Button>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  const profile = {
    fullName: account.profile.full_name,
    phone: doctor.phone,
    specialty: doctor.specialty,
    clinicName: doctor.clinic_name,
    experienceYears: doctor.experience_years,
    biography: doctor.biography,
    timezone: doctor.timezone,
    consultationFee:
      doctor.consultation_fee_minor === null ? null : doctor.consultation_fee_minor / 100,
  };

  const initials =
    account.profile.full_name
      .replace(/^(Dr\.?)\s+/i, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w: string) => w[0])
      .join("")
      .toUpperCase() || "DR";

  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="space-y-6 max-w-4xl">
        {/* Header Console */}
        <div className="border-b border-border/60 pb-5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary mb-1">
            <UserRound className="size-3.5" />
            <span>Practitioner Profile</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
            Professional Profile & Credentials
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Manage your public doctor bio, consultation fees, clinic location, and active consulting hours.
          </p>
        </div>

        {/* Identity & Credentials Card */}
        <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-xs">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 p-6 bg-surface-muted/30">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl shadow-inner">
                {initials}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-[#1D2153]">
                    {profile.fullName}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                    Verified MD
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                    {profile.specialty}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {profile.experienceYears} yrs experience
                  </Badge>
                </div>
              </div>
            </div>

            {/* Edit Drawer Trigger */}
            <Sheet>
              <SheetTrigger
                aria-label="Edit professional profile"
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-xs font-semibold hover:bg-accent hover:text-accent-foreground self-start sm:self-auto transition-colors"
              >
                <Pencil className="size-3.5" />
                <span>Edit Profile</span>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Edit Professional Profile</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <DoctorProfileForm profile={profile} />
                </div>
              </SheetContent>
            </Sheet>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Consultation Fee Status */}
            {profile.consultationFee === null ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 text-xs text-amber-950 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Coins className="size-4" />
                  <span>Consultation Fee Not Configured</span>
                </p>
                <p className="leading-relaxed">
                  Configure an in-clinic consultation fee before patients can book appointments with you. Click &ldquo;Edit Profile&rdquo; above to set your fee.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Coins className="size-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      In-Clinic Consultation Fee
                    </p>
                    <p className="text-lg font-extrabold text-[#1D2153]">
                      ₹{profile.consultationFee.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Charged at clinic desk upon arrival
                </span>
              </div>
            )}

            {/* Practice Details Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Clinic Location
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <MapPin className="size-4 text-primary" />
                  <span>{profile.clinicName}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Practice Timezone
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Clock className="size-4 text-primary" />
                  <span>{profile.timezone}</span>
                </div>
              </div>
            </div>

            {/* Biography */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Clinical Biography & Patient Care Philosophy
              </h3>
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground whitespace-pre-line bg-surface-muted/30 rounded-2xl p-4 border border-border/60">
                {profile.biography}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
