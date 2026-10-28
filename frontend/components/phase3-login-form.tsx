"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useState } from "react";
import { ResendVerificationButton } from "@/components/resend-verification-button";

export function Phase3LoginForm({ verified = false }: { verified?: boolean }) {
  const [state, action, pending] = useActionState(signInAction, {} as ActionState);
  const [email, setEmail] = useState("");
  const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined;
  return <Card><CardHeader><CardTitle>Welcome back</CardTitle><CardDescription>Sign in to continue to your care portal.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5">{verified && <AuthFormMessage success="Your email is verified. You can sign in now." />}<div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError || state.fieldErrors?.email)} required />{(emailError || state.fieldErrors?.email) && <p className="text-xs text-destructive" role="alert">{emailError || state.fieldErrors?.email}</p>}</div><div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/auth/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">Forgot password?</Link></div><PasswordInput id="password" name="password" autoComplete="current-password" required /></div><AuthFormMessage error={state.error} />{state.code === "email_not_confirmed" && email && <ResendVerificationButton email={email} />}<Button type="submit" disabled={pending || Boolean(emailError)}>{pending ? "Signing in…" : "Sign in"}</Button><p className="text-center text-sm text-muted-foreground">New to Schedula? <Link href="/auth/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">Create an account</Link></p></form></CardContent></Card>;
}
