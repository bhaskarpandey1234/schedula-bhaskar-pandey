"use client";
import { useActionState } from "react";
import { completePatientOnboarding, type ActionState } from "@/lib/auth/actions";
import { OnboardingFormMessage } from "@/components/onboarding-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PatientOnboardingForm() { const [state, action, pending] = useActionState(completePatientOnboarding, {} as ActionState); return <Card><CardHeader><CardTitle>Complete your patient profile</CardTitle><CardDescription>These details help keep your care experience accurate.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="phone">Phone number</Label><Input id="phone" name="phone" type="tel" placeholder="+14155552671" autoComplete="tel" required /></div><div className="grid gap-2"><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" required /></div><OnboardingFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue to patient portal"}</Button></form></CardContent></Card>; }
