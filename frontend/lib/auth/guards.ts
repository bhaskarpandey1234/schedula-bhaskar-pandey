import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/validation/auth";
import { destinationForRole, portalDestinationFor, type PortalDestination } from "@/lib/auth/portal-destination";
import { evaluateProfileCompletion, type ProfileCompletion } from "@/lib/auth/profile-completion";

export type { PortalDestination } from "@/lib/auth/portal-destination";

export async function getCurrentAccount() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const emailVerified = Boolean(userData.user.email_confirmed_at);
  const { data: profile } = await supabase.from("profiles").select("id, full_name, role").eq("id", userData.user.id).maybeSingle();
  if (!profile) return { user: userData.user, profile: null, onboardingComplete: false, emailVerified };
  const detailsQuery = profile.role === "patient"
    ? supabase.from("patients").select("phone, date_of_birth").eq("id", userData.user.id).maybeSingle()
    : supabase.from("doctors").select("phone, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency").eq("id", userData.user.id).maybeSingle();
  const { data: rawDetails } = await detailsQuery;
  const details = rawDetails ? { ...(rawDetails as Record<string, unknown>), full_name: profile.full_name } : null;
  const completion: ProfileCompletion = evaluateProfileCompletion(profile.role, userData.user.email, details);
  return { user: userData.user, profile, onboardingComplete: completion.complete, completion, emailVerified };
}

export async function resolvePortalDestination(): Promise<PortalDestination> {
  return portalDestinationFor(await getCurrentAccount());
}

export async function requireRole(role: Role) {
  const account = await getCurrentAccount();
  if (!account) redirect("/auth/login");
  if (!account.emailVerified) redirect("/auth/verify-email");
  if (!account.profile || !account.onboardingComplete || !account.profile.full_name) redirect("/onboarding");
  if (account.profile.role !== role) redirect(destinationForRole(account.profile.role));
  return account;
}

export async function requireVerifiedUser() {
  const account = await getCurrentAccount();
  if (!account) throw new Error("AUTHENTICATION_REQUIRED");
  if (!account.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");
  return account;
}

export async function requireCompleteProfile(role: Role) {
  const account = await requireVerifiedUser();
  if (account.profile?.role !== role) throw new Error("ROLE_NOT_ALLOWED");
  if (!account.onboardingComplete) throw new Error("PROFILE_INCOMPLETE");
  return account;
}
