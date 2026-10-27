import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/validation/auth";
import { destinationForRole, portalDestinationFor, type PortalDestination } from "@/lib/auth/portal-destination";

export type { PortalDestination } from "@/lib/auth/portal-destination";

export async function getCurrentAccount() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: profile } = await supabase.from("profiles").select("id, full_name, role").eq("id", userData.user.id).maybeSingle();
  if (!profile) return { user: userData.user, profile: null, onboardingComplete: false };
  const { data: details } = await supabase.from(profile.role === "patient" ? "patients" : "doctors").select("id").eq("id", userData.user.id).maybeSingle();
  return { user: userData.user, profile, onboardingComplete: Boolean(details) };
}

export async function resolvePortalDestination(): Promise<PortalDestination> {
  return portalDestinationFor(await getCurrentAccount());
}

export async function requireRole(role: Role) {
  const account = await getCurrentAccount();
  if (!account) redirect("/auth/login");
  if (!account.profile || !account.onboardingComplete) redirect("/onboarding");
  if (account.profile.role !== role) redirect(destinationForRole(account.profile.role));
  return account;
}
