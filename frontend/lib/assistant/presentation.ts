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
  if (code === "ASSISTANT_UNAVAILABLE") return "Gemini is temporarily unavailable. Please try again shortly.";
  if (code === "ASSISTANT_QUOTA_EXHAUSTED") return "The Gemini free-tier quota is currently exhausted. Please try again later.";
  if (code === "ASSISTANT_TIMEOUT") return "The assistant took too long to respond. Please try again.";
  if (code === "AUTHENTICATION_REQUIRED" || code === "ROLE_NOT_ALLOWED") return "Your session is no longer authorized. Please sign in again.";
  if (code === "ASSISTANT_PILOT_ACCESS_REQUIRED") return "This synthetic account is not enabled for the assistant pilot.";
  return "The assistant could not connect. Please try again.";
}
