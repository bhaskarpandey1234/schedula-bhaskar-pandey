import type { Role } from "@/lib/validation/auth";

export type PortalDestination = "/auth/login" | "/onboarding" | "/doctors" | "/doctor";

export type AccountAccess = {
  profile: { role: Role } | null;
  onboardingComplete: boolean;
} | null;

export function portalDestinationFor(account: AccountAccess): PortalDestination {
  if (!account) return "/auth/login";
  if (!account.profile || !account.onboardingComplete) return "/onboarding";
  return account.profile.role === "patient" ? "/doctors" : "/doctor";
}

export function destinationForRole(role: Role): Extract<PortalDestination, "/doctors" | "/doctor"> {
  return role === "patient" ? "/doctors" : "/doctor";
}
