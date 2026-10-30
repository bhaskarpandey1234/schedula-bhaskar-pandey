import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/layout/auth-shell";
import { DoctorOnboardingForm } from "@/components/doctor-onboarding-form";
import { PatientOnboardingForm } from "@/components/patient-onboarding-form";
import { getCurrentAccount } from "@/lib/auth/guards";
import { ProfileCompletionNotice } from "@/components/profile-completion-notice";

export const instant = false;

export default async function OnboardingPage() {
  await connection();
  const account = await getCurrentAccount();
  if (!account) redirect("/auth/login");
  if (!account.emailVerified) redirect("/auth/verify-email");
  if (!account.profile) redirect("/auth/error?reason=profile_missing");
  if (account.onboardingComplete) redirect(account.profile.role === "patient" ? "/patient" : "/doctor");
  return <AuthShell><div className="grid gap-4"><ProfileCompletionNotice missingFields={account.completion?.missingFields ?? []} /><>{account.profile.role === "patient" ? <PatientOnboardingForm /> : <DoctorOnboardingForm />}</></div></AuthShell>;
}
