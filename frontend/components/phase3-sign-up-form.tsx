"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Phase3SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {} as ActionState);
  return <Card><CardHeader><CardTitle>Create your Schedula account</CardTitle><CardDescription>Choose your role and verify your email to continue.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" autoComplete="name" required /></div><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div><div className="grid gap-2"><Label htmlFor="role">I am joining as</Label><select id="role" name="role" defaultValue="patient" className="h-10 rounded-md border border-input bg-surface px-3 text-sm" required><option value="patient">Patient</option><option value="doctor">Doctor</option></select></div><div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></div><div className="grid gap-2"><Label htmlFor="passwordConfirmation">Confirm password</Label><Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></div><AuthFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button><p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">Sign in</Link></p></form></CardContent></Card>;
}
