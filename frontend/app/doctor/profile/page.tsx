import { connection } from "next/server";
import { DoctorProfileForm } from "@/components/doctor-profile-form";
import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function DoctorProfilePage() {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctors").select("specialty, clinic_name, experience_years, biography, timezone").eq("id", account.user.id).single();
  if (!doctor) return null;
  return <PortalShell role="doctor" name={account.profile.full_name}><div className="grid gap-5"><div><h1 className="text-3xl font-semibold tracking-tight">Professional details</h1><p className="mt-2 text-muted-foreground">Keep the information patients see accurate and useful.</p></div><DoctorProfileForm profile={{ fullName: account.profile.full_name, specialty: doctor.specialty, clinicName: doctor.clinic_name, experienceYears: doctor.experience_years, biography: doctor.biography, timezone: doctor.timezone }} /></div></PortalShell>;
}
