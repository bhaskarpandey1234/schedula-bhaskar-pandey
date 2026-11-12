export const assistantLanguageOptions = [
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
] as const;

export function assistantLanguageLabel(value: string) {
  return assistantLanguageOptions.find((option) => option.value === value)?.label ?? "English";
}

export function speechRecognitionLanguage(value: string) {
  return value === "hinglish" ? "en-IN" : value;
}

export function assistantErrorMessage(code?: string) {
  if (code === "ASSISTANT_DISABLED") return "The assistant is disabled for this environment. Ask an administrator to enable the pilot.";
  if (code === "ASSISTANT_CONFIGURATION_REQUIRED") return "The assistant is not configured. A Gemini API key is required for this environment.";
  if (code === "ASSISTANT_UNAVAILABLE") return "Gemini is temporarily unavailable. Please try again shortly.";
  if (code === "ASSISTANT_QUOTA_EXHAUSTED") return "The Gemini free-tier quota is currently exhausted. Please try again later.";
  if (code === "ASSISTANT_TIMEOUT") return "The assistant took too long to respond. Please try again.";
  if (code === "ASSISTANT_NETWORK_ERROR") return "The assistant could not reach Gemini. Check the server connection and try again.";
  if (code === "GEMINI_AUTH_FAILED") return "Gemini rejected the configured API key. Check the server configuration.";
  if (code === "GEMINI_MODEL_UNAVAILABLE") return "The configured Gemini model is unavailable. Check the server model configuration.";
  if (code === "GEMINI_INVALID_REQUEST") return "Gemini could not continue the tool conversation. Please retry or contact the administrator if it continues.";
  if (code === "GEMINI_REQUEST_FAILED") return "Gemini returned an unexpected error. Please try again or contact the administrator if it continues.";
  if (code === "ASSISTANT_PAYMENT_SANDBOX_REQUIRED") return "Booking checkout is disabled until a Razorpay test-mode key is configured for this pilot.";
  if (code === "AUTHENTICATION_REQUIRED" || code === "ROLE_NOT_ALLOWED") return "Your session is no longer authorized. Please sign in again.";
  if (code === "ASSISTANT_PILOT_ACCESS_REQUIRED") return "This synthetic account is not enabled for the assistant pilot.";
  if (code === "EMAIL_NOT_VERIFIED") return "Verify your email before using the assistant.";
  if (code === "PROFILE_INCOMPLETE") return "Complete your profile before using the assistant.";
  if (code === "ASSISTANT_RATE_LIMITED") return "You have reached the short-term assistant limit. Please wait a minute and try again.";
  if (code === "ASSISTANT_CSRF_REJECTED") return "This request came from an untrusted origin. Refresh the page and try again.";
  if (code === "STALE_ACTION") return "That confirmation is stale. Refresh the appointment and prepare a new action.";
  if (code === "INVALID_ASSISTANT_REQUEST" || code === "INVALID_ACTION_DECISION") return "That request was not valid. Please try again.";
  return "The assistant could not connect. Please try again.";
}
