"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { useState } from "react";
import { useEffect } from "react";
import { AuthFormMessage } from "@/components/auth-form-message";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";
import { ResendVerificationForm } from "@/components/resend-verification-form";

export function Phase3SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpAction, {} as ActionState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => { if (state.values?.email && !email) setEmail(state.values.email); }, [state.values?.email, email]);
  const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined;
  const passwordError = password.length > 0 && password.length < 12 ? "Use at least 12 characters." : undefined;
  const loginHref = next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login";
  return <Card><CardHeader><CardTitle>Create your Schedula account</CardTitle><CardDescription>Start with the essentials. We’ll collect profile details next.</CardDescription></CardHeader><CardContent className="grid gap-5"><form action={action} noValidate className="grid gap-5"><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError || state.fieldErrors?.email)} aria-describedby={(emailError || state.fieldErrors?.email) ? "signup-email-error" : undefined} required /><FieldError id="signup-email-error">{emailError || state.fieldErrors?.email}</FieldError></div><div className="grid gap-2"><Label htmlFor="role">I am joining as</Label><CustomSelect id="role" name="role" defaultValue={state.values?.role ?? "patient"} options={[{ value: "patient", label: "Patient" }, { value: "doctor", label: "Doctor" }]} required error={Boolean(state.fieldErrors?.role)} describedBy={state.fieldErrors?.role ? "signup-role-error" : undefined} /><FieldError id="signup-role-error">{state.fieldErrors?.role}</FieldError></div><div className="grid gap-2"><Label htmlFor="password">Password</Label><PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(passwordError || state.fieldErrors?.password)} aria-describedby={(passwordError || state.fieldErrors?.password) ? "signup-password-error" : undefined} required /><FieldError id="signup-password-error">{passwordError || state.fieldErrors?.password}</FieldError></div><FormErrorSummary error={state.error} />{state.success && <AuthFormMessage success="Account created. Check your inbox and verify your email before signing in." />}<Button type="submit" disabled={pending || Boolean(emailError) || Boolean(passwordError)}>{pending ? "Creating account…" : "Create account"}</Button><p className="text-center text-sm text-muted-foreground">Already have an account? <Link href={loginHref} className="font-medium text-primary underline-offset-4 hover:underline">Sign in</Link></p></form>{state.success && <ResendVerificationForm initialEmail={state.values?.email} />}</CardContent></Card>;
}
