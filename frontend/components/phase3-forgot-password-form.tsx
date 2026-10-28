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

export function Phase3ForgotPasswordForm() { const [state, action, pending] = useActionState(forgotPasswordAction, {} as ActionState); const [email, setEmail] = useState(""); const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined; return <Card><CardHeader><CardTitle>Reset your password</CardTitle><CardDescription>We’ll send a reset link if an account exists for that email.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError)} required />{emailError && <p className="text-xs text-destructive" role="alert">{emailError}</p>}</div><AuthFormMessage error={state.error} success={state.success ? "Check your email for reset instructions." : undefined} /><Button type="submit" disabled={pending || Boolean(emailError)}>{pending ? "Sending…" : "Send reset email"}</Button><p className="text-center text-sm text-muted-foreground"><Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">Return to sign in</Link></p></form></CardContent></Card>; }
