"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type ActionState } from "@/lib/auth/actions";
import { AuthFormMessage } from "@/components/auth-form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { useState } from "react";
import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

export function Phase3SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {} as ActionState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const router = useRouter();
  useEffect(() => { if (state.success) setSuccessOpen(true); }, [state.success]);
  useEffect(() => { if (state.values?.email && !email) setEmail(state.values.email); }, [state.values?.email, email]);
  const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined;
  const passwordError = password.length > 0 && password.length < 12 ? "Use at least 12 characters." : undefined;
  return <><Card><CardHeader><CardTitle>Create your Schedula account</CardTitle><CardDescription>Start with the essentials. We’ll collect profile details next.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError || state.fieldErrors?.email)} required />{(emailError || state.fieldErrors?.email) && <p className="text-xs text-destructive" role="alert">{emailError || state.fieldErrors?.email}</p>}</div><div className="grid gap-2"><Label htmlFor="role">I am joining as</Label><CustomSelect id="role" name="role" defaultValue={state.values?.role ?? "patient"} options={[{ value: "patient", label: "Patient" }, { value: "doctor", label: "Doctor" }]} required /></div><div className="grid gap-2"><Label htmlFor="password">Password</Label><PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(passwordError || state.fieldErrors?.password)} required />{(passwordError || state.fieldErrors?.password) && <p className="text-xs text-destructive" role="alert">{passwordError || state.fieldErrors?.password}</p>}</div><AuthFormMessage error={state.error} /><Button type="submit" disabled={pending || Boolean(emailError) || Boolean(passwordError)}>{pending ? "Creating account…" : "Create account"}</Button><p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">Sign in</Link></p></form></CardContent></Card><Dialog open={successOpen} onOpenChange={setSuccessOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" aria-hidden="true" />Account created</DialogTitle><DialogDescription>Check your email to verify your Schedula account before signing in.</DialogDescription></DialogHeader><DialogFooter><Button type="button" onClick={() => router.push("/auth/login")}>Go to sign in</Button></DialogFooter></DialogContent></Dialog></>;
}
