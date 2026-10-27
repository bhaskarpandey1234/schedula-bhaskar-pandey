"use client";
import { useActionState } from "react";
import { updatePasswordAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Phase3UpdatePasswordForm() { const [state, action, pending] = useActionState(updatePasswordAction, {} as ActionState); return <Card><CardHeader><CardTitle>Choose a new password</CardTitle><CardDescription>Use at least 12 characters, then continue to your portal.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></div><div className="grid gap-2"><Label htmlFor="passwordConfirmation">Confirm new password</Label><Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></div><AuthFormMessage error={state.error} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button></form></CardContent></Card>; }
