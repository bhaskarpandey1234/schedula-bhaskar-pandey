"use client";

import { useActionState, useEffect, useState } from "react";
import { completeDoctorOnboarding, type ActionState } from "@/lib/auth/actions";
import { BioGenerator } from "@/components/bio-generator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import { specialtyOptions, experienceOptions, timezoneOptions } from "@/lib/profile-options";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";

export function DoctorOnboardingForm() {
  const [state, action, pending] = useActionState(completeDoctorOnboarding, {} as ActionState);
  const [values, setValues] = useState({ fullName: "", specialty: "", clinicName: "", experienceYears: "", biography: "", timezone: "Asia/Kolkata", consultationFee: "1000" });
  useEffect(() => { if (state.values) setValues((current) => ({ ...current, ...state.values })); }, [state.values]);
  return <Card><CardHeader><CardTitle>Set up your doctor profile</CardTitle><CardDescription>Patients will see these professional details when they search.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid gap-5">
    <div className="grid gap-2"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" autoComplete="name" value={values.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} required /><FieldError id="doctor-name-error">{state.fieldErrors?.fullName}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="phone">Phone number</Label><PhoneInput id="phone" defaultValue={state.values?.phone} /><p className="text-xs text-muted-foreground">Required for clinic contact and appointment notifications.</p><FieldError id="doctor-phone-error">{state.fieldErrors?.phone}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="specialty">Specialty</Label><CustomSelect id="specialty" name="specialty" value={values.specialty} onValueChange={(value) => setValues({ ...values, specialty: value })} options={specialtyOptions.map((value) => ({ value, label: value }))} required /><FieldError id="doctor-specialty-error">{state.fieldErrors?.specialty}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="clinicName">Clinic name</Label><Input id="clinicName" name="clinicName" value={values.clinicName} onChange={(e) => setValues({ ...values, clinicName: e.target.value })} required /><FieldError id="doctor-clinic-error">{state.fieldErrors?.clinicName}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="experienceYears">Years of experience</Label><CustomSelect id="experienceYears" name="experienceYears" value={values.experienceYears} onValueChange={(value) => setValues({ ...values, experienceYears: value })} options={experienceOptions} required /><FieldError id="doctor-experience-error">{state.fieldErrors?.experienceYears}</FieldError></div>
    <div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="biography">Biography</Label><BioGenerator specialty={values.specialty} clinicName={values.clinicName} experienceYears={values.experienceYears} onGenerate={(biography) => setValues({ ...values, biography })} /></div><textarea id="biography" name="biography" rows={5} value={values.biography} onChange={(e) => setValues({ ...values, biography: e.target.value })} className="rounded-md border border-input px-3 py-2 text-sm" required /><FieldError id="doctor-bio-error">{state.fieldErrors?.biography}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><CustomSelect id="timezone" name="timezone" value={values.timezone} onValueChange={(value) => setValues({ ...values, timezone: value })} options={timezoneOptions.map((value) => ({ value, label: value }))} required /><FieldError id="doctor-timezone-error">{state.fieldErrors?.timezone}</FieldError></div>
    <div className="grid gap-2"><Label htmlFor="consultationFee">Consultation fee (INR)</Label><Input id="consultationFee" name="consultationFee" type="number" min="1" max="100000" step="0.01" value={values.consultationFee} onChange={(e) => setValues({ ...values, consultationFee: e.target.value })} required /><FieldError id="doctor-fee-error">{state.fieldErrors?.consultationFee}</FieldError></div>
    <FormErrorSummary error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Open doctor workspace"}</Button>
  </form></CardContent></Card>;
}
