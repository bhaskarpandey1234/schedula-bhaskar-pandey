"use client";

import { useTransition } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function Phase3LogoutButton() {
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => startTransition(() => void signOutAction())}>{pending ? "Signing out…" : "Sign out"}</Button>;
}
