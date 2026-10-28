"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useState } from "react";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";

export function Phase3LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, {} as ActionState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined;
  const signUpHref = next ? `/auth/sign-up?next=${encodeURIComponent(next)}` : "/auth/sign-up";
  return <Card><CardHeader><CardTitle>Welcome back</CardTitle><CardDescription>Sign in to continue to your care portal.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid gap-5"><input type="hidden" name="next" value={next ?? ""} /><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError || state.fieldErrors?.email)} aria-describedby={(emailError || state.fieldErrors?.email) ? "login-email-error" : undefined} required /><FieldError id="login-email-error">{emailError || state.fieldErrors?.email}</FieldError></div><div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/auth/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">Forgot password?</Link></div><PasswordInput id="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.password)} aria-describedby={state.fieldErrors?.password ? "login-password-error" : undefined} required /><FieldError id="login-password-error">{state.fieldErrors?.password}</FieldError></div><FormErrorSummary error={state.error} /><Button type="submit" disabled={pending || Boolean(emailError)}>{pending ? "Signing in…" : "Sign in"}</Button><p className="text-center text-sm text-muted-foreground">New to Schedula? <Link href={signUpHref} className="font-medium text-primary underline-offset-4 hover:underline">Create an account</Link></p></form></CardContent></Card>;
}
