import { connection } from "next/server";
import { Pencil, Phone, UserRound } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/portal-shell";
import { PatientProfileForm } from "@/components/patient-profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const instant = false;

export default async function PatientProfilePage() {
  await connection();
  const account = await requireRole("patient");
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("phone, date_of_birth").eq("id", account.user.id).single();
  if (!patient) return null;
  return <PortalShell role="patient" name={account.profile.full_name}><div className="grid gap-6">
    <div><p className="text-sm font-medium text-primary">Profile</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Your account details</h1></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader className="flex-row items-start justify-between gap-4"><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Personal details</CardTitle><Sheet><SheetTrigger aria-label="Edit personal details" className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil /></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Edit personal details</SheetTitle></SheetHeader><div className="mt-6"><PatientProfileForm profile={{ fullName: account.profile.full_name, phone: patient.phone, dateOfBirth: patient.date_of_birth }} /></div></SheetContent></Sheet></CardHeader><CardContent className="grid gap-3 text-sm"><div><p className="text-muted-foreground">Full name</p><p className="font-medium">{account.profile.full_name}</p></div><div className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /><span>{patient.phone}</span></div><div><p className="text-muted-foreground">Date of birth</p><p>{patient.date_of_birth}</p></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Signed in securely with your Schedula account.</p></CardContent></Card></div>
  </div></PortalShell>;
}
