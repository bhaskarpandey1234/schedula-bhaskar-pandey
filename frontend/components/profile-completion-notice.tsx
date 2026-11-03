import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProfileMissingField } from "@/lib/auth/profile-completion";
import { missingFieldLabels } from "@/lib/auth/profile-completion";

export function ProfileCompletionNotice({ missingFields, compact = false }: { missingFields: ProfileMissingField[]; compact?: boolean }) {
  if (!missingFields.length) return null;
  const labels = missingFieldLabels(missingFields);
  return <div role="alert" className={`rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 ${compact ? "p-4" : "p-5"}`}>
    <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" /><div className="space-y-2"><p className="font-semibold">Complete your profile before using scheduling features.</p><p className="text-sm">Please add {labels.join(", ")}.</p><Button asChild size="sm" variant="outline" className="border-amber-400 bg-amber-100 hover:bg-amber-200"><Link href="/onboarding">Complete profile</Link></Button></div></div>
  </div>;
}
