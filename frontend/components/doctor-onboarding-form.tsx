"use client";

import { useActionState, useEffect, useState } from "react";
import { completeDoctorOnboarding, type ActionState } from "@/lib/auth/actions";
import { OnboardingFormMessage } from "@/components/onboarding-form-message";
import { BioGenerator } from "@/components/bio-generator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { specialtyOptions, experienceOptions, timezoneOptions } from "@/lib/profile-options";

export function DoctorOnboardingForm() {
  const [state, action, pending] = useActionState(completeDoctorOnboarding, {} as ActionState);
  const [specialty, setSpecialty] = useState(state.values?.specialty ?? "");
  const [clinicName, setClinicName] = useState(state.values?.clinicName ?? "");
  const [experienceYears, setExperienceYears] = useState(state.values?.experienceYears ?? "");
  const [biography, setBiography] = useState(state.values?.biography ?? "");
  const [timezone, setTimezone] = useState(state.values?.timezone ?? "Asia/Kolkata");
  useEffect(() => { if (state.values) { setSpecialty(state.values.specialty ?? ""); setClinicName(state.values.clinicName ?? ""); setExperienceYears(state.values.experienceYears ?? ""); setBiography(state.values.biography ?? ""); setTimezone(state.values.timezone ?? "Asia/Kolkata"); } }, [state.values]);
  return <Card><CardHeader><CardTitle>Set up your doctor profile</CardTitle><CardDescription>Use the guided options to create a clear profile for patients.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="specialty">Specialty</Label><CustomSelect id="specialty" name="specialty" value={specialty} onValueChange={setSpecialty} options={specialtyOptions.map((value) => ({ value, label: value }))} required />{state.fieldErrors?.specialty && <p className="text-xs text-destructive" role="alert">{state.fieldErrors.specialty}</p>}</div><div className="grid gap-2"><Label htmlFor="clinicName">Clinic name</Label><Input id="clinicName" name="clinicName" value={clinicName} onChange={(event) => setClinicName(event.target.value)} placeholder="e.g. River Clinic" required /></div><div className="grid gap-2"><Label htmlFor="experienceYears">Years of experience</Label><CustomSelect id="experienceYears" name="experienceYears" value={experienceYears} onValueChange={setExperienceYears} options={experienceOptions} required /></div><div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="biography">Biography</Label><BioGenerator specialty={specialty} clinicName={clinicName} experienceYears={experienceYears} onGenerate={setBiography} /></div><textarea id="biography" name="biography" rows={5} value={biography} onChange={(event) => setBiography(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Describe your approach to care." required /></div><div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><CustomSelect id="timezone" name="timezone" value={timezone} onValueChange={setTimezone} options={timezoneOptions.map((value) => ({ value, label: value }))} required /></div><OnboardingFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue to doctor portal"}</Button></form></CardContent></Card>;
}
