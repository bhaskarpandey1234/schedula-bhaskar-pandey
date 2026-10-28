"use client";

import { useActionState } from "react";
import { resendVerificationAction, type ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { AuthFormMessage } from "@/components/auth-form-message";

export function ResendVerificationButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerificationAction, {} as ActionState);
  return <form action={action} className="grid gap-2"><input type="hidden" name="email" value={email} /><Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Sending…" : "Resend verification email"}</Button><AuthFormMessage error={state.error} success={state.success ? "A new verification email is on its way." : undefined} /></form>;
}
