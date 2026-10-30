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
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";

type DoctorProfile = { fullName: string; specialty: string; clinicName: string; experienceYears: number; biography: string; timezone: string; consultationFee: number | null };

export function DoctorProfileForm({ profile }: { profile: DoctorProfile }) {
  const [state, action, pending] = useActionState(updateDoctorProfileAction, {} as AvailabilityActionState);
  const [values, setValues] = useState({ ...profile, experienceYears: String(profile.experienceYears), consultationFee: profile.consultationFee === null ? "" : String(profile.consultationFee) });
  useEffect(() => { if (state.values) setValues((current) => ({ ...current, ...state.values })); }, [state.values]);
  return <Card><CardHeader><CardTitle>Doctor profile</CardTitle><CardDescription>Keep your professional details and consultation price up to date.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid gap-4">
    <div className="grid gap-2"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" value={values.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} required /><FieldError id="profile-name-error">{state.fieldErrors?.fullName}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="specialty">Specialty</Label><CustomSelect id="specialty" name="specialty" value={values.specialty} onValueChange={(value) => setValues({ ...values, specialty: value })} options={specialtyOptions.map((value) => ({ value, label: value }))} required /><FieldError id="profile-specialty-error">{state.fieldErrors?.specialty}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="clinicName">Clinic name</Label><Input id="clinicName" name="clinicName" value={values.clinicName} onChange={(e) => setValues({ ...values, clinicName: e.target.value })} required /><FieldError id="profile-clinic-error">{state.fieldErrors?.clinicName}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="experienceYears">Years of experience</Label><CustomSelect id="experienceYears" name="experienceYears" value={values.experienceYears} onValueChange={(value) => setValues({ ...values, experienceYears: value })} options={experienceOptions} required /><FieldError id="profile-experience-error">{state.fieldErrors?.experienceYears}</FieldError></div>
    <div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="biography">Biography</Label><BioGenerator specialty={values.specialty} clinicName={values.clinicName} experienceYears={values.experienceYears} onGenerate={(biography) => setValues({ ...values, biography })} /></div><textarea id="biography" name="biography" rows={4} value={values.biography} onChange={(e) => setValues({ ...values, biography: e.target.value })} className="rounded-md border border-input px-3 py-2 text-sm" required /><FieldError id="profile-bio-error">{state.fieldErrors?.biography}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><CustomSelect id="timezone" name="timezone" value={values.timezone} onValueChange={(value) => setValues({ ...values, timezone: value })} options={timezoneOptions.map((value) => ({ value, label: value }))} required /><FieldError id="profile-timezone-error">{state.fieldErrors?.timezone}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="consultationFee">Consultation fee (INR)</Label><Input id="consultationFee" name="consultationFee" type="number" min="1" max="100000" step="0.01" value={values.consultationFee} onChange={(e) => setValues({ ...values, consultationFee: e.target.value })} required /><FieldError id="profile-fee-error">{state.fieldErrors?.consultationFee}</FieldError></div>
    <FormErrorSummary error={state.error} />{state.success && <p role="status" className="text-sm text-success">Profile saved.</p>}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
  </form></CardContent></Card>;
}
