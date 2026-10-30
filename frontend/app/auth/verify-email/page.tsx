import { connection } from "next/server";
import { AuthShell } from "@/components/layout/auth-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { getCurrentAccount } from "@/lib/auth/guards";

export const instant = false;

export default async function VerifyEmailPage({ searchParams }: { searchParams?: Promise<{ email?: string }> }) {
  await connection();
  const account = await getCurrentAccount();
  const params = await searchParams;
  const email = account?.user.email ?? params?.email ?? "";
  return <AuthShell><Card><CardHeader><CardTitle>Verify your email</CardTitle><CardDescription>Verification is required before you can access your Schedula account.</CardDescription></CardHeader><CardContent className="grid gap-5"><p className="text-sm text-muted-foreground">Use the newest link in your inbox. Verification links expire, so request another email if needed.</p><ResendVerificationForm initialEmail={email} /><p className="text-center text-sm text-muted-foreground"><a href="/auth/login" className="text-primary underline-offset-4 hover:underline">Return to sign in</a></p></CardContent></Card></AuthShell>;
}
