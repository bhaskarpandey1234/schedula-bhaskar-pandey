"use client";

import { useActionState, useState } from "react";
import { completePatientOnboarding, type ActionState } from "@/lib/auth/actions";
import { OnboardingFormMessage } from "@/components/onboarding-form-message";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PatientOnboardingForm() {
  const [state, action, pending] = useActionState(completePatientOnboarding, {} as ActionState);
  const [dateOfBirth, setDateOfBirth] = useState(state.values?.dateOfBirth ?? "");
  return <Card><CardHeader><CardTitle>Complete your patient profile</CardTitle><CardDescription>These details help keep your care experience accurate.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="phone">Phone number</Label><PhoneInput defaultValue={state.values?.phone} /><p className="text-xs text-muted-foreground">Choose a country code and enter a reachable number.</p>{state.fieldErrors?.phone && <p className="text-xs text-destructive" role="alert">{state.fieldErrors.phone}</p>}</div><div className="grid gap-2"><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.dateOfBirth)} required />{state.fieldErrors?.dateOfBirth && <p className="text-xs text-destructive" role="alert">{state.fieldErrors.dateOfBirth}</p>}</div><OnboardingFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue to patient portal"}</Button></form></CardContent></Card>;
}
