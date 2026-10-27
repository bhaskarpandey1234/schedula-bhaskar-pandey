"use client";
import { useActionState } from "react";
import { completeDoctorOnboarding, type ActionState } from "@/lib/auth/actions";
import { OnboardingFormMessage } from "@/components/onboarding-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DoctorOnboardingForm() { const [state, action, pending] = useActionState(completeDoctorOnboarding, {} as ActionState); return <Card><CardHeader><CardTitle>Set up your doctor profile</CardTitle><CardDescription>Patients will use this information to understand your practice.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="specialty">Specialty</Label><Input id="specialty" name="specialty" required /></div><div className="grid gap-2"><Label htmlFor="clinicName">Clinic name</Label><Input id="clinicName" name="clinicName" required /></div><div className="grid gap-2"><Label htmlFor="experienceYears">Years of experience</Label><Input id="experienceYears" name="experienceYears" type="number" min="0" max="80" required /></div><div className="grid gap-2"><Label htmlFor="biography">Biography</Label><textarea id="biography" name="biography" rows={5} className="rounded-md border border-input bg-surface px-3 py-2 text-sm" required /></div><div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><Input id="timezone" name="timezone" placeholder="Asia/Kolkata" defaultValue="Asia/Kolkata" required /></div><OnboardingFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue to doctor portal"}</Button></form></CardContent></Card>; }
