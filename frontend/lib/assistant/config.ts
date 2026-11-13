import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/validation/auth";

export const assistantConfig = {
  enabled: process.env.ASSISTANT_PILOT_MODE === "true",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  textModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash",
  liveModel: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
  confirmationTtlMs: 5 * 60 * 1000,
};

export async function requireAssistantPilotAccess(role: Role) {
  if (!assistantConfig.enabled || !assistantConfig.geminiApiKey) throw new Error("ASSISTANT_UNAVAILABLE");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("AUTHENTICATION_REQUIRED");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!profile || profile.role !== role) throw new Error("ROLE_NOT_ALLOWED");
  const { data: access } = await supabase.from("assistant_pilot_access").select("user_id").eq("user_id", userData.user.id).eq("enabled", true).maybeSingle();
  if (!access) throw new Error("ASSISTANT_PILOT_ACCESS_REQUIRED");
  return { supabase, user: userData.user, role };
}

export function assistantErrorStatus(error: unknown) {
  const code = error instanceof Error ? error.message : "ASSISTANT_ERROR";
  if (code === "ASSISTANT_PILOT_ACCESS_REQUIRED") return 403;
  if (code === "AUTHENTICATION_REQUIRED" || code === "ROLE_NOT_ALLOWED") return 401;
  if (code === "ASSISTANT_UNAVAILABLE") return 503;
  return 400;
}
