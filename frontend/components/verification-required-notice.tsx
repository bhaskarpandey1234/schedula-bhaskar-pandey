import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VerificationRequiredNotice({ email }: { email?: string }) {
  return <div role="status" className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
    <div className="flex items-start gap-3"><MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div className="grid gap-1"><p className="font-medium">Verify your email to continue</p><p className="text-muted-foreground">Open the newest verification link from your inbox before using your Schedula account.</p>{email && <p className="text-muted-foreground">We’ll send it to <span className="font-medium text-foreground">{email}</span>.</p>}</div></div>
    <Button asChild variant="link" className="w-fit justify-start px-0"><Link href="/auth/verify-email">Open verification help</Link></Button>
  </div>;
}
