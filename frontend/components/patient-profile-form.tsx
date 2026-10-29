"use client";

import { useActionState, useEffect, useState } from "react";
import { updatePatientProfileAction, type PatientProfileActionState } from "@/lib/patient/actions";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";

export function PatientProfileForm({ profile }: { profile: { fullName: string; phone: string; dateOfBirth: string } }) {
  const [state, action, pending] = useActionState(updatePatientProfileAction, {} as PatientProfileActionState);
  const [fullName, setFullName] = useState(profile.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth);
  useEffect(() => { if (state.values) { setFullName(state.values.fullName ?? profile.fullName); setDateOfBirth(state.values.dateOfBirth ?? profile.dateOfBirth); } }, [state.values, profile]);
  return <form action={action} noValidate className="grid gap-4"><div className="grid gap-2"><Label htmlFor="profile-fullName">Full name</Label><Input id="profile-fullName" name="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.fullName)} required /><FieldError id="patient-profile-name-error">{state.fieldErrors?.fullName}</FieldError></div><div className="grid gap-2"><Label htmlFor="profile-phone">Phone number</Label><PhoneInput id="profile-phone" defaultValue={state.values?.phone ?? profile.phone} /><FieldError id="patient-profile-phone-error">{state.fieldErrors?.phone}</FieldError></div><div className="grid gap-2"><Label htmlFor="profile-dateOfBirth">Date of birth</Label><Input id="profile-dateOfBirth" name="dateOfBirth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.dateOfBirth)} required /><FieldError id="patient-profile-dob-error">{state.fieldErrors?.dateOfBirth}</FieldError></div><FormErrorSummary error={state.error} />{state.success && <p role="status" className="text-sm text-success">Profile saved.</p>}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button></form>;
}
