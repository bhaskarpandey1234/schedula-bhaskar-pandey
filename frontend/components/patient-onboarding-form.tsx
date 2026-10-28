"use client";

import { useActionState, useState } from "react";
import { completePatientOnboarding, type ActionState } from "@/lib/auth/actions";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";

export function PatientOnboardingForm() {
  const [state, action, pending] = useActionState(completePatientOnboarding, {} as ActionState);
  const [dateOfBirth, setDateOfBirth] = useState(state.values?.dateOfBirth ?? "");
  return <Card><CardHeader><CardTitle>Complete your patient profile</CardTitle><CardDescription>These details help keep your care experience accurate.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid gap-5"><div className="grid gap-2"><Label htmlFor="phone">Phone number</Label><PhoneInput defaultValue={state.values?.phone} /><p className="text-xs text-muted-foreground">Choose a country code and enter a reachable number.</p><FieldError id="patient-phone-error">{state.fieldErrors?.phone}</FieldError></div><div className="grid gap-2"><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.dateOfBirth)} aria-describedby={state.fieldErrors?.dateOfBirth ? "patient-dob-error" : undefined} required /><FieldError id="patient-dob-error">{state.fieldErrors?.dateOfBirth}</FieldError></div><FormErrorSummary error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue to patient portal"}</Button></form></CardContent></Card>;
}
