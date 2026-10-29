export function authErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  if (error?.code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return { code: "email_not_confirmed", message: "Please verify your email before signing in." };
  }
  if (message.includes("invalid login credentials")) return { code: "invalid_credentials", message: "The email or password is incorrect." };
  if (message.includes("user already registered") || message.includes("already been registered")) return { code: "email_in_use", message: "An account already exists for this email. Try signing in instead." };
  if (message.includes("password") && message.includes("characters")) return { code: "weak_password", message: "Use at least 12 characters for your password." };
  return { code: "auth_error", message: "We could not complete that request. Please check your details and try again." };
}
