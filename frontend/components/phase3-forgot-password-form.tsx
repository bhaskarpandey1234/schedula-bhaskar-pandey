"use client";
import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";

export function Phase3ForgotPasswordForm() { const [state, action, pending] = useActionState(forgotPasswordAction, {} as ActionState); const [email, setEmail] = useState(""); const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined; return <Card><CardHeader><CardTitle>Reset your password</CardTitle><CardDescription>We’ll send a reset link if an account exists for that email.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid gap-5"><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError || state.fieldErrors?.email)} aria-describedby={(emailError || state.fieldErrors?.email) ? "forgot-email-error" : undefined} required /><FieldError id="forgot-email-error">{emailError || state.fieldErrors?.email}</FieldError></div><FormErrorSummary error={state.error} />{state.success && <AuthFormMessage success="Check your email for reset instructions." />}<Button type="submit" disabled={pending || Boolean(emailError)}>{pending ? "Sending…" : "Send reset email"}</Button><p className="text-center text-sm text-muted-foreground"><Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">Return to sign in</Link></p></form></CardContent></Card>; }
