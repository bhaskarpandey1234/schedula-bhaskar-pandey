import type { Role } from "@/lib/validation/auth";

export type PortalDestination = "/auth/login" | "/onboarding" | "/patient" | "/doctor" | "/staff" | "/admin";

export type AccountAccess = {
  profile: { role: Role } | null;
  onboardingComplete: boolean;
} | null;

export function portalDestinationFor(account: AccountAccess): PortalDestination {
  if (!account) return "/auth/login";
  if (!account.profile || !account.onboardingComplete) return "/onboarding";
  return destinationForRole(account.profile.role);
}

export function destinationForRole(role: Role): Extract<PortalDestination, "/patient" | "/doctor" | "/staff" | "/admin"> {
  return `/${role}`;
}
