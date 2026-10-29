type AuthProviderError = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
};

export type AuthErrorCategory =
  | "email_not_confirmed"
  | "invalid_credentials"
  | "rate_limited"
  | "configuration"
  | "provider_error"
  | "auth_error";

function errorDetails(error: unknown): AuthProviderError {
  if (!error || typeof error !== "object") return {};
  return error as AuthProviderError;
}

function normalizedError(error: unknown) {
  const details = errorDetails(error);
  return {
    code: typeof details.code === "string" ? details.code.toLowerCase() : "",
    message: typeof details.message === "string" ? details.message.toLowerCase() : "",
    status: typeof details.status === "number" ? details.status : undefined,
  };
}

export function authErrorCategory(error: unknown): AuthErrorCategory {
  const { code, message, status } = normalizedError(error);

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (status === 429 || code.includes("rate") || code.includes("too_many") || message.includes("rate limit") || message.includes("too many requests")) return "rate_limited";
  if (code.includes("api_key") || code.includes("configuration") || message.includes("invalid api key") || message.includes("missing supabase")) return "configuration";
  if ((status !== undefined && status >= 500) || message.includes("database error") || message.includes("provider error") || message.includes("service unavailable")) return "provider_error";
  return "auth_error";
}

export function authErrorMessage(error: unknown) {
  switch (authErrorCategory(error)) {
    case "email_not_confirmed":
      return { code: "email_not_confirmed", message: "Please verify your email before signing in." };
    case "invalid_credentials":
      return { code: "invalid_credentials", message: "The email or password is incorrect." };
    case "rate_limited":
      return { code: "rate_limited", message: "Too many sign-in attempts. Please wait a few minutes and try again." };
    case "configuration":
      return { code: "auth_configuration_error", message: "Authentication is temporarily unavailable. Please try again later." };
    case "provider_error":
      return { code: "auth_provider_error", message: "Authentication is temporarily unavailable. Please try again later." };
    default:
      return { code: "auth_error", message: "We could not complete that request. Please check your details and try again." };
  }
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : undefined;
}

export function authErrorDiagnostic(error: unknown, request = "password_sign_in") {
  const details = errorDetails(error);
  const status = typeof details.status === "number" && Number.isFinite(details.status) ? details.status : undefined;
  return {
    request,
    category: authErrorCategory(error),
    name: typeof details.name === "string" ? details.name.slice(0, 64) : undefined,
    status,
    code: safeCode(details.code),
  };
}
