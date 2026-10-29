export type AuthRedirectPath = "/onboarding" | "/auth/update-password";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return configured.replace(/\/+$/, "");
}

export function getAuthConfirmRedirect(next: AuthRedirectPath) {
  return `${getSiteUrl()}/auth/confirm?next=${next}`;
}
