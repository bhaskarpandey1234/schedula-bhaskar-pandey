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

export function speechSynthesisLanguage(value: string) {
  return value === "hinglish" ? "hi-IN" : value;
}

export function assistantResponseLanguageInstruction(value?: string) {
  if (value === "hi-IN") return "Reply in Hindi using Devanagari, even when the user's message is in another language.";
  if (value === "hinglish") return "Reply in natural Hinglish, mixing Hindi written in Latin script with English, even when the user's message is in another language.";
  return "Reply in English, even when the user's message is in another language.";
}

export function assistantGroundedResultText(kind: "doctors" | "slots", count: number, language?: string) {
  if (language === "hi-IN") {
    if (kind === "doctors") return count ? `${count} सत्यापित डॉक्टर मिले हैं। उनकी जानकारी नीचे दी गई है।` : "कोई सत्यापित डॉक्टर नहीं मिला।";
    return count ? "ये उपलब्ध appointment समय हैं। बुकिंग की समीक्षा के लिए एक समय चुनें।" : "अभी कोई उपलब्ध appointment समय नहीं है।";
  }
  if (language === "hinglish") {
    if (kind === "doctors") return count ? `${count} verified doctors mile hain. Unki details neeche hain.` : "Koi verified doctor nahi mila.";
    return count ? "Ye available appointment times hain. Booking review ke liye ek slot choose karein." : "Abhi koi appointment slot available nahi hai.";
  }
  if (kind === "doctors") {
    if (!count) return "No verified doctors were found.";
    return `I found ${count} verified ${count === 1 ? "doctor" : "doctors"}. Their details are shown below.`;
  }
  return count ? "These appointment times are available. Choose a slot to review the booking." : "No appointment slots are currently available.";
}

export function assistantGroundedAppointmentText(count: number, language?: string) {
  if (language === "hi-IN") {
    return count ? `${count} अपॉइंटमेंट मिले हैं। विवरण नीचे दिए गए हैं।` : "कोई अपॉइंटमेंट नहीं मिला।";
  }
  if (language === "hinglish") {
    return count ? `${count} appointments mile hain. Details neeche diye gaye hain.` : "Koi appointment nahi mila.";
  }
  if (!count) return "No appointments were found.";
  return `I found ${count} ${count === 1 ? "appointment" : "appointments"}. Details are shown below.`;
}

export function assistantVerificationRequiredText(language?: string) {
  if (language === "hi-IN") return "डॉक्टर या अपॉइंटमेंट समय बताने से पहले मुझे सिस्टम में उनकी पुष्टि करनी होगी। कृपया डॉक्टर खोजने के लिए फिर से पूछें।";
  if (language === "hinglish") return "Doctor ya appointment time batane se pehle mujhe system mein verify karna hoga. Doctor search karne ke liye dobara poochhein.";
  return "I need to verify doctors and appointment times in the booking system before suggesting or preparing one. Please ask me to search again.";
}

export function assistantTypedSlotSelectionRequiredText(language?: string) {
  if (language === "hi-IN") return "कृपया ऊपर दिए गए उपलब्ध समय बटन से स्लॉट चुनें। लिखकर भेजा गया समय बुकिंग के लिए स्वीकार नहीं किया जा सकता।";
  if (language === "hinglish") return "Upar diye available-time button se slot choose karein. Type kiya hua time booking ke liye accept nahi hota.";
  return "Please choose an available-time button, or use “See available times” on a verified doctor card. A time typed in chat cannot be booked.";
}

export function assistantBookingPreviewRequiredText(language?: string) {
  if (language === "hi-IN") return "अभी पुष्टि के लिए कोई बुकिंग तैयार नहीं है। पहले उपलब्ध स्लॉट बटन चुनें; फिर समीक्षा में Confirm दबाएँ।";
  if (language === "hinglish") return "Abhi confirm karne ke liye booking ready nahi hai. Pehle available slot button choose karein, phir review mein Confirm dabayein.";
  return "There is no booking ready to confirm yet. Choose an available slot button first, then confirm its review.";
}

export function assistantIsFreeformSlotPrompt(text: string, response: string) {
  const asksForDateOrTime = /\b(?:tell|provide|enter|type|send|share).{0,40}\b(?:date|time)\b|\b(?:date|time)\b.{0,30}\b(?:tell|provide|enter|type|send|share)\b/i.test(text);
  const containsDateOrTime = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+[a-z]{3,9}\s+\d{4}\b/i.test(response);
  return asksForDateOrTime && containsDateOrTime;
}

export function assistantIsUnstructuredBookingPreview(text: string) {
  return /\b(?:booking preview|appointment preview|do you want me to book|please confirm|ready for review|prepared this action for your confirmation)\b/i.test(text);
}

export function assistantRequiresVerifiedDoctorData(text: string) {
  const mentionsDoctor = /\b(?:doctors?|dr\.?|cardiologists?|cardiology|physicians?|specialists?)\b|डॉक्टर|चिकित्सक/i.test(text);
  const requestsAction = /\b(?:find|search|recommend|suggest|list|show|nearby|book|booking|appointment|slots?|availability|available|schedule|check)\b|खोज|ढूंढ|बुक|अपॉइंटमेंट|स्लॉट|उपलब्ध/i.test(text);
  return mentionsDoctor && requestsAction;
}

export function assistantSelectedSlotText(language?: string) {
  if (language === "hi-IN") return "चुना गया समय समीक्षा के लिए तैयार है। बुकिंग की पुष्टि करने से पहले विवरण जाँचें।";
  if (language === "hinglish") return "Selected slot review ke liye ready hai. Booking confirm karne se pehle details check karein.";
  return "The selected slot is ready for review. Check the details before confirming the booking.";
}

export function assistantErrorCanRetry(code?: string) {
  return code === "ASSISTANT_UNAVAILABLE"
    || code === "ASSISTANT_QUOTA_EXHAUSTED"
    || code === "ASSISTANT_TIMEOUT"
    || code === "ASSISTANT_NETWORK_ERROR"
    || code === "ASSISTANT_PROVIDER_MODEL_UNAVAILABLE";
}

export function assistantErrorMessage(code?: string) {
  if (code === "ASSISTANT_DISABLED") return "The assistant is disabled for this environment. Ask an administrator to enable the pilot.";
  if (code === "ASSISTANT_CONFIGURATION_REQUIRED") return "The assistant is not configured. A provider API key is required for this environment.";
  if (code === "ASSISTANT_UNAVAILABLE") return "The AI service is temporarily unavailable. Please try again shortly.";
  if (code === "ASSISTANT_QUOTA_EXHAUSTED") return "The assistant provider quota is currently exhausted. Please try again later.";
  if (code === "ASSISTANT_TIMEOUT") return "The assistant took too long to respond. Please try again.";
  if (code === "ASSISTANT_NETWORK_ERROR") return "The assistant could not reach the AI service. Check the server connection and try again.";
  if (code === "ASSISTANT_PROVIDER_AUTH_FAILED") return "The AI service rejected the configured API key. Check the server configuration.";
  if (code === "ASSISTANT_PROVIDER_MODEL_UNAVAILABLE") return "The configured AI model is unavailable. Check the server model configuration.";
  if (code === "ASSISTANT_PROVIDER_INVALID_REQUEST") return "The AI service could not continue the tool conversation. Please retry or contact the administrator if it continues.";
  if (code === "ASSISTANT_PROVIDER_REQUEST_FAILED") return "The AI service returned an unexpected error. Please try again or contact the administrator if it continues.";
  if (code === "ASSISTANT_TOOL_LOOP_LIMIT") return "The assistant could not finish this multi-step request safely. Please try a simpler request.";
  if (code === "ASSISTANT_PAYMENT_SANDBOX_REQUIRED") return "Booking checkout is disabled until a Razorpay test-mode key is configured for this pilot.";
  if (code === "AUTHENTICATION_REQUIRED" || code === "ROLE_NOT_ALLOWED") return "Your session is no longer authorized. Please sign in again.";
  if (code === "ASSISTANT_PILOT_ACCESS_REQUIRED") return "This synthetic account is not enabled for the assistant pilot.";
  if (code === "EMAIL_NOT_VERIFIED") return "Verify your email before using the assistant.";
  if (code === "PROFILE_INCOMPLETE") return "Complete your profile before using the assistant.";
  if (code === "ASSISTANT_RATE_LIMITED") return "You have reached the short-term assistant limit. Please wait a minute and try again.";
  if (code === "ASSISTANT_CSRF_REJECTED") return "This request came from an untrusted origin. Refresh the page and try again.";
  if (code === "STALE_ACTION") return "That confirmation is stale. Refresh the appointment and prepare a new action.";
  if (code === "ASSISTANT_ACTION_STALE") return "The schedule changed since this preview. Ask me to preview the change again before confirming.";
  if (code === "SLOT_UNAVAILABLE") return "That time is no longer available. Ask me to refresh the doctor's available slots and choose another time.";
  if (code === "INVALID_ASSISTANT_REQUEST" || code === "INVALID_ACTION_DECISION") return "That request was not valid. Please try again.";
  return "The assistant could not connect. Please try again.";
}
