import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

const messages: Record<string, { title: string; description: string }> = {
  incomplete_link: { title: "This verification link is incomplete or expired", description: "Request a new verification email, then open the newest link." },
  verification_failed: { title: "We could not verify that link", description: "The link may have expired or already been used. Request a new email and try again." },
  profile_missing: { title: "Your account setup is not ready", description: "Sign in again or contact support if the issue continues." },
};

export default async function AuthErrorPage({ searchParams }: { searchParams?: Promise<{ reason?: string }> }) {
  const reason = (await searchParams)?.reason ?? "verification_failed";
  const message = messages[reason] ?? messages.verification_failed;
  return <AuthShell><Card><CardHeader><CardTitle className="flex items-center gap-2 text-xl"><CircleAlert className="size-5 text-destructive" aria-hidden="true" />{message.title}</CardTitle></CardHeader><CardContent className="grid gap-4"><p className="text-sm leading-6 text-muted-foreground">{message.description}</p><div className="flex flex-wrap gap-2"><Button asChild><Link href="/auth/login">Go to sign in</Link></Button><Button asChild variant="outline"><Link href="/auth/forgot-password">Reset password</Link></Button></div></CardContent></Card></AuthShell>;
}
