import Link from "next/link";
import { AlertTriangle, CheckCircle2, Mail, Phone, ShieldCheck } from "lucide-react";
import { missingFieldLabels, type ProfileCompletion } from "@/lib/auth/profile-completion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AccountProfileSummaryProps = {
  roleLabel: "Patient" | "Doctor";
  email: string | null | undefined;
  emailVerified: boolean;
  fullName: string;
  phone: string | null | undefined;
  completion: ProfileCompletion;
  notificationHref: string;
  details: Array<{ label: string; value: string | number | null | undefined }>;
};

export function AccountProfileSummary({ roleLabel, email, emailVerified, fullName, phone, completion, notificationHref, details }: AccountProfileSummaryProps) {
  return <Card className="rounded-3xl border-border bg-card shadow-xs">
    <CardHeader className="border-b border-border/60 bg-surface-muted/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Account information</CardTitle>
          <CardDescription>Read-only account and {roleLabel.toLowerCase()} profile details.</CardDescription>
        </div>
        <Badge variant={completion.complete ? "secondary" : "outline"} className="gap-1">
          {completion.complete ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {completion.complete ? "Profile complete" : "Profile incomplete"}
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-5 p-6">
      {!completion.complete && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />Complete your profile to use scheduling actions.</p>
        <p className="mt-1 text-xs">Missing: {missingFieldLabels(completion.missingFields).join(", ")}.</p>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Full name</p>
          <p className="mt-1 text-sm font-bold text-foreground">{fullName || "Not provided"}</p>
          <p className="mt-2 text-xs text-muted-foreground">Role: {roleLabel}</p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Mail className="size-3.5" />Email</p>
          <p className="mt-1 break-all text-sm font-bold text-foreground">{email || "Not available"}</p>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />{emailVerified ? "Verified email" : "Email verification required"}</p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4 sm:col-span-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Phone className="size-3.5" />Phone number</p>
          <p className="mt-1 text-sm font-bold text-foreground">{phone || "Not provided"}</p>
          <p className="mt-2 text-xs text-muted-foreground">Stored in international E.164 format for appointment communication.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {details.map((detail) => <div key={detail.label} className="rounded-2xl border border-border/80 bg-surface-muted/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{detail.label}</p>
          <p className="mt-1 whitespace-pre-line break-words text-sm font-bold text-foreground">{detail.value === null || detail.value === undefined || detail.value === "" ? "Not provided" : String(detail.value)}</p>
        </div>)}
      </div>
      <Link href={notificationHref} className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline">Manage notification preferences</Link>
    </CardContent>
  </Card>;
}
