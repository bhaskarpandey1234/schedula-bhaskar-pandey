import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/validation/auth";
import { getCurrentAccount } from "@/lib/auth/guards";

export const assistantConfig = {
  enabled: process.env.ASSISTANT_PILOT_MODE === "true",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  textModel: process.env.GROQ_TEXT_MODEL ?? "qwen/qwen3.8-27b",
  fallbackTextModel: process.env.GROQ_FALLBACK_TEXT_MODEL ?? "openai/gpt-oss-120b",
  confirmationTtlMs: 5 * 60 * 1000,
};

export function assertAssistantMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new Error("ASSISTANT_CSRF_REJECTED");
}

export async function requireAssistantPilotAccess(role: Role) {
  if (!assistantConfig.enabled) throw new Error("ASSISTANT_DISABLED");
  if (!assistantConfig.groqApiKey) throw new Error("ASSISTANT_CONFIGURATION_REQUIRED");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("AUTHENTICATION_REQUIRED");
  if (!userData.user.email_confirmed_at) throw new Error("EMAIL_NOT_VERIFIED");
  const account = await getCurrentAccount();
  if (!account?.profile || account.profile.role !== role) throw new Error("ROLE_NOT_ALLOWED");
  if (!account.onboardingComplete) throw new Error("PROFILE_INCOMPLETE");
  const { count, error: rateError } = await supabase.from("assistant_audit_events").select("id", { count: "exact", head: true }).eq("user_id", userData.user.id).gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if (!rateError && (count ?? 0) >= 20) throw new Error("ASSISTANT_RATE_LIMITED");
  return { supabase, user: userData.user, role };
}

export function assistantErrorStatus(error: unknown) {
  const code = error instanceof Error ? error.message : "ASSISTANT_ERROR";
  if (code === "ASSISTANT_PILOT_ACCESS_REQUIRED") return 403;
  if (code === "AUTHENTICATION_REQUIRED" || code === "EMAIL_NOT_VERIFIED") return 401;
  if (code === "ROLE_NOT_ALLOWED" || code === "PROFILE_INCOMPLETE") return 403;
  if (code === "ASSISTANT_DISABLED" || code === "ASSISTANT_CONFIGURATION_REQUIRED") return 503;
  if (code === "ASSISTANT_UNAVAILABLE") return 503;
  if (code === "ASSISTANT_QUOTA_EXHAUSTED") return 429;
  if (code === "ASSISTANT_RATE_LIMITED") return 429;
  if (code === "ASSISTANT_CSRF_REJECTED") return 403;
  if (code === "ASSISTANT_TIMEOUT") return 504;
  if (code === "ASSISTANT_NETWORK_ERROR" || code === "ASSISTANT_PROVIDER_AUTH_FAILED" || code === "ASSISTANT_PROVIDER_MODEL_UNAVAILABLE") return 503;
  if (code === "ASSISTANT_PAYMENT_SANDBOX_REQUIRED") return 503;
  if (code === "ASSISTANT_ACTION_STALE") return 409;
  if (code === "ASSISTANT_PROVIDER_INVALID_REQUEST") return 502;
  if (code === "ASSISTANT_PROVIDER_REQUEST_FAILED") return 502;
  if (code === "ASSISTANT_TOOL_LOOP_LIMIT") return 502;
  return 400;
}
