import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PatientOnboardingForm } from "@/components/patient-onboarding-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getCurrentAccount } from "@/lib/auth/guards";
import { ProfileCompletionNotice } from "@/components/profile-completion-notice";

export const instant = false;

export default async function PatientOnboardingPage() {
  await connection();
  const account = await getCurrentAccount();
  if (!account) redirect("/auth/login");
  if (!account.emailVerified) redirect("/auth/verify-email");
  if (account.profile?.role !== "patient") redirect(account.profile?.role === "doctor" ? "/doctor" : "/onboarding");
  if (account.onboardingComplete) redirect("/patient");
  return <AuthShell><div className="grid gap-4"><ProfileCompletionNotice missingFields={account.completion?.missingFields ?? []} /><PatientOnboardingForm /></div></AuthShell>;
}
