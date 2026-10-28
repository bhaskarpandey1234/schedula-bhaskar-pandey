import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DoctorOnboardingForm } from "@/components/doctor-onboarding-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getCurrentAccount } from "@/lib/auth/guards";

export const instant = false;

export default async function DoctorOnboardingPage() {
  await connection();
  const account = await getCurrentAccount();
  if (!account) redirect("/auth/login");
  if (account.profile?.role !== "doctor") redirect(account.profile?.role === "patient" ? "/patient" : "/onboarding");
  if (account.onboardingComplete) redirect("/doctor");
  return <AuthShell><DoctorOnboardingForm /></AuthShell>;
}
