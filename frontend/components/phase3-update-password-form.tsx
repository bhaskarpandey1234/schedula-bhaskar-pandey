"use client";
import { useActionState } from "react";
import { updatePasswordAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useState } from "react";

export function Phase3UpdatePasswordForm() { const [state, action, pending] = useActionState(updatePasswordAction, {} as ActionState); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const passwordError = password.length > 0 && password.length < 12 ? "Use at least 12 characters." : undefined; const matchError = confirmation.length > 0 && password !== confirmation ? "Passwords do not match." : undefined; return <Card><CardHeader><CardTitle>Choose a new password</CardTitle><CardDescription>Use at least 12 characters, then continue to your portal.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="password">New password</Label><PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(passwordError)} required />{passwordError && <p className="text-xs text-destructive" role="alert">{passwordError}</p>}</div><div className="grid gap-2"><Label htmlFor="passwordConfirmation">Confirm new password</Label><PasswordInput id="passwordConfirmation" name="passwordConfirmation" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-invalid={Boolean(matchError)} required />{matchError && <p className="text-xs text-destructive" role="alert">{matchError}</p>}</div><AuthFormMessage error={state.error} /><Button type="submit" disabled={pending || Boolean(passwordError) || Boolean(matchError)}>{pending ? "Saving…" : "Save password"}</Button></form></CardContent></Card>; }
