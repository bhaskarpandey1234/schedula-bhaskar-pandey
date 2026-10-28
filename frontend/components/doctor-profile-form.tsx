"use client";

import { useActionState, useEffect, useState } from "react";
import { updateDoctorProfileAction, type AvailabilityActionState } from "@/lib/availability/actions";
import { BioGenerator } from "@/components/bio-generator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { specialtyOptions, experienceOptions, timezoneOptions } from "@/lib/profile-options";

type DoctorProfile = { fullName: string; specialty: string; clinicName: string; experienceYears: number; biography: string; timezone: string };

export function DoctorProfileForm({ profile }: { profile: DoctorProfile }) {
  const [state, action, pending] = useActionState(updateDoctorProfileAction, {} as AvailabilityActionState);
  const [fullName, setFullName] = useState(profile.fullName);
  const [specialty, setSpecialty] = useState(profile.specialty);
  const [clinicName, setClinicName] = useState(profile.clinicName);
  const [experienceYears, setExperienceYears] = useState(String(profile.experienceYears));
  const [biography, setBiography] = useState(profile.biography);
  const [timezone, setTimezone] = useState(profile.timezone);
  useEffect(() => { if (state.values) { setFullName(state.values.fullName ?? profile.fullName); setSpecialty(state.values.specialty ?? profile.specialty); setClinicName(state.values.clinicName ?? profile.clinicName); setExperienceYears(state.values.experienceYears ?? String(profile.experienceYears)); setBiography(state.values.biography ?? profile.biography); setTimezone(state.values.timezone ?? profile.timezone); } }, [state.values, profile]);
  return <Card><CardHeader><CardTitle>Doctor profile</CardTitle><CardDescription>Use guided options and keep the information patients see up to date.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-4"><div className="grid gap-2"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="specialty">Specialty</Label><CustomSelect id="specialty" name="specialty" value={specialty} onValueChange={setSpecialty} options={specialtyOptions.map((value) => ({ value, label: value }))} required /></div><div className="grid gap-2"><Label htmlFor="clinicName">Clinic name</Label><Input id="clinicName" name="clinicName" value={clinicName} onChange={(event) => setClinicName(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="experienceYears">Years of experience</Label><CustomSelect id="experienceYears" name="experienceYears" value={experienceYears} onValueChange={setExperienceYears} options={experienceOptions} required /></div><div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="biography">Biography</Label><BioGenerator specialty={specialty} clinicName={clinicName} experienceYears={experienceYears} onGenerate={setBiography} /></div><textarea id="biography" name="biography" rows={4} value={biography} onChange={(event) => setBiography(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" required /></div><div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><CustomSelect id="timezone" name="timezone" value={timezone} onValueChange={setTimezone} options={timezoneOptions.map((value) => ({ value, label: value }))} required /></div>{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="text-sm text-success">Profile saved.</p>}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button></form></CardContent></Card>;
}
