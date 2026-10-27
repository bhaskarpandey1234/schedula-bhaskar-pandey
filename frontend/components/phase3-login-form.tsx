"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Phase3LoginForm() {
  const [state, action, pending] = useActionState(signInAction, {} as ActionState);
  return <Card><CardHeader><CardTitle>Welcome back</CardTitle><CardDescription>Sign in to continue to your care portal.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div><div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/auth/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">Forgot password?</Link></div><Input id="password" name="password" type="password" autoComplete="current-password" required /></div><AuthFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button><p className="text-center text-sm text-muted-foreground">New to Schedula? <Link href="/auth/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">Create an account</Link></p></form></CardContent></Card>;
}
