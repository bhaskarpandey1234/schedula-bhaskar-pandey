import type { Role } from "@/lib/validation/auth";

export type PortalDestination = "/auth/login" | "/onboarding" | "/patient" | "/doctor";

export type AccountAccess = {
  profile: { role: Role } | null;
  onboardingComplete: boolean;
} | null;

export function portalDestinationFor(account: AccountAccess): PortalDestination {
  if (!account) return "/auth/login";
  if (!account.profile || !account.onboardingComplete) return "/onboarding";
  return account.profile.role === "patient" ? "/patient" : "/doctor";
}

export function destinationForRole(role: Role): Extract<PortalDestination, "/patient" | "/doctor"> {
  return role === "patient" ? "/patient" : "/doctor";
}
