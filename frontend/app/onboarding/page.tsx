import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/layout/auth-shell";
import { DoctorOnboardingForm } from "@/components/doctor-onboarding-form";
import { PatientOnboardingForm } from "@/components/patient-onboarding-form";
import { getCurrentAccount } from "@/lib/auth/guards";

export const instant = false;

export default async function OnboardingPage() {
  await connection();
  const account = await getCurrentAccount();
  if (!account) redirect("/auth/login");
  if (!account.profile) redirect("/auth/error?reason=profile_missing");
  if (account.onboardingComplete) redirect(account.profile.role === "patient" ? "/patient" : "/doctor");
  return <AuthShell>{account.profile.role === "patient" ? <PatientOnboardingForm /> : <DoctorOnboardingForm />}</AuthShell>;
}
