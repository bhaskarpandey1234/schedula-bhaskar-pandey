import { connection } from "next/server";
import { Calendar, Lock, Pencil, Phone, ShieldCheck, UserRound } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/portal-shell";
import { PatientProfileForm } from "@/components/patient-profile-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const instant = false;

export default async function PatientProfilePage() {
  await connection();
  const account = await requireRole("patient");
  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("phone, date_of_birth")
    .eq("id", account.user.id)
    .single();

  if (!patient) return null;

  const initials =
    account.profile.full_name
      .split(/\s+/)
      .slice(0, 2)
      .map((w: string) => w[0])
      .join("")
      .toUpperCase() || "PT";

  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="border-b border-border/60 pb-5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary mb-1">
            <UserRound className="size-3.5" />
            <span>Account Center</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
            Personal Profile & Records
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Manage your personal contact details, verified mobile number, and healthcare communication preferences.
          </p>
        </div>

        {/* Identity & Contact Card */}
        <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-xs">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 p-6 bg-surface-muted/30">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl shadow-inner">
                {initials}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-[#1D2153]">
                    {account.profile.full_name}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                    Verified
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Schedula Patient Account
                </p>
              </div>
            </div>

            {/* Edit Drawer Trigger */}
            <Sheet>
              <SheetTrigger
                aria-label="Edit personal details"
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-xs font-semibold hover:bg-accent hover:text-accent-foreground self-start sm:self-auto transition-colors"
              >
                <Pencil className="size-3.5" />
                <span>Edit Profile</span>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Edit Personal Details</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <PatientProfileForm
                    profile={{
                      fullName: account.profile.full_name,
                      phone: patient.phone,
                      dateOfBirth: patient.date_of_birth,
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </CardHeader>

          <CardContent className="p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Primary Mobile Number
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Phone className="size-4 text-primary" />
                  <span>{patient.phone}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Used for confirmed appointment booking and SMS visit notifications.
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Date of Birth
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Calendar className="size-4 text-primary" />
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "long",
                    }).format(new Date(patient.date_of_birth))}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Shared securely with consulting physicians during clinic intake.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Privacy & Security Card */}
        <Card className="rounded-3xl border-border bg-card p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1D2153]">
            <Lock className="size-4 text-primary" />
            <span>Healthcare Data Privacy & Security</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your clinical data and appointment bookings are encrypted. Only verified consulting physicians at the booked clinics have access to your intake information during active appointments.
          </p>
        </Card>
      </div>
    </PortalShell>
  );
}
