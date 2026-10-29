import { connection } from "next/server";
import { DoctorProfileForm } from "@/components/doctor-profile-form";
import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Pencil, Stethoscope, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const instant = false;

export default async function DoctorProfilePage() {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctors").select("specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor").eq("id", account.user.id).single();
  if (!doctor) return null;
  const profile = { fullName: account.profile.full_name, specialty: doctor.specialty, clinicName: doctor.clinic_name, experienceYears: doctor.experience_years, biography: doctor.biography, timezone: doctor.timezone, consultationFee: doctor.consultation_fee_minor ? doctor.consultation_fee_minor / 100 : 1000 };
  return <PortalShell role="doctor" name={account.profile.full_name}><div className="grid gap-6"><div><p className="text-sm font-medium text-primary">Profile</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Your professional profile</h1></div><Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="text-xl">{profile.fullName}</CardTitle><p className="mt-1 text-sm text-primary">{profile.specialty}</p></div><Sheet><SheetTrigger aria-label="Edit professional profile" className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="size-4" /></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Edit professional profile</SheetTitle></SheetHeader><div className="mt-6"><DoctorProfileForm profile={profile} /></div></SheetContent></Sheet></CardHeader><CardContent className="grid gap-5 md:grid-cols-3"><div className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 text-primary" /><div><p className="text-muted-foreground">Clinic</p><p className="font-medium">{profile.clinicName}</p></div></div><div className="flex items-start gap-2 text-sm"><Stethoscope className="mt-0.5 size-4 text-primary" /><div><p className="text-muted-foreground">Experience</p><p className="font-medium">{profile.experienceYears} years</p></div></div><div className="flex items-start gap-2 text-sm"><Clock className="mt-0.5 size-4 text-primary" /><div><p className="text-muted-foreground">Timezone</p><p className="font-medium">{profile.timezone}</p></div></div><div className="md:col-span-3"><p className="text-sm text-muted-foreground">About</p><p className="mt-1 text-sm leading-6">{profile.biography}</p></div></CardContent></Card></div></PortalShell>;
}
