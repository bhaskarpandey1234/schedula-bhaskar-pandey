"use client";

import { useActionState } from "react";
import { updateDoctorProfileAction, type AvailabilityActionState } from "@/lib/availability/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DoctorProfile = { fullName: string; specialty: string; clinicName: string; experienceYears: number; biography: string; timezone: string };

export function DoctorProfileForm({ profile }: { profile: DoctorProfile }) {
  const [state, action, pending] = useActionState(updateDoctorProfileAction, {} as AvailabilityActionState);
  return <Card><CardHeader><CardTitle>Doctor profile</CardTitle><CardDescription>Keep the information patients will use to understand your practice up to date.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-4"><div className="grid gap-2"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" defaultValue={profile.fullName} required /></div><div className="grid gap-2"><Label htmlFor="specialty">Specialty</Label><Input id="specialty" name="specialty" defaultValue={profile.specialty} required /></div><div className="grid gap-2"><Label htmlFor="clinicName">Clinic name</Label><Input id="clinicName" name="clinicName" defaultValue={profile.clinicName} required /></div><div className="grid gap-2"><Label htmlFor="experienceYears">Years of experience</Label><Input id="experienceYears" name="experienceYears" type="number" min="0" max="80" defaultValue={profile.experienceYears} required /></div><div className="grid gap-2"><Label htmlFor="biography">Biography</Label><textarea id="biography" name="biography" rows={4} defaultValue={profile.biography} className="rounded-md border border-input bg-surface px-3 py-2 text-sm" required /></div><div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><Input id="timezone" name="timezone" defaultValue={profile.timezone} required /></div>{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="text-sm text-success">Profile saved.</p>}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button></form></CardContent></Card>;
}
