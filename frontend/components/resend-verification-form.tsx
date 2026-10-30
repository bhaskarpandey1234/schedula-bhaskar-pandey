"use client";

import { useActionState, useEffect, useState } from "react";
import { resendVerificationAction, type ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthFormMessage } from "@/components/auth-form-message";
import { FieldError } from "@/components/ui/form-feedback";

export function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, action, pending] = useActionState(resendVerificationAction, {} as ActionState);
  const [email, setEmail] = useState(initialEmail);
  useEffect(() => {
    if (state.values?.email) setEmail(state.values.email);
  }, [state.values?.email]);
  const emailError = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : undefined;

  return <form action={action} noValidate className="grid gap-3">
    <div className="grid gap-2">
      <Label htmlFor="verification-email">Email address</Label>
      <Input id="verification-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError || state.fieldErrors?.email)} aria-describedby={(emailError || state.fieldErrors?.email) ? "verification-email-error" : undefined} required />
      <FieldError id="verification-email-error">{emailError || state.fieldErrors?.email}</FieldError>
    </div>
    {state.error && <AuthFormMessage error={state.error} />}
    {state.success && <AuthFormMessage success="If an account needs verification, a new email is on its way. Check your inbox and spam folder." />}
    <Button type="submit" variant="outline" disabled={pending || Boolean(emailError)}>{pending ? "Sending email…" : "Send verification email again"}</Button>
  </form>;
}
