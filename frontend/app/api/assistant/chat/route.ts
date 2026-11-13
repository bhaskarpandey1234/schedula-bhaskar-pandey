import { NextResponse } from "next/server";
import { assistantConfig, assistantErrorStatus, assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { runGeminiAssistant } from "@/lib/assistant/gemini";
import { assistantChatRequestSchema } from "@/lib/assistant/schemas";

export async function POST(request: Request) {
  const started = Date.now();
  try {
    assertAssistantMutationOrigin(request);
    const parsed = assistantChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const { role, messages, language } = parsed.data;
    const access = await requireAssistantPilotAccess(role);
    const result = await runGeminiAssistant({ role, userId: access.user.id, supabase: access.supabase, messages, language });
    await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, event_type: "chat_turn", outcome: "succeeded", model: assistantConfig.textModel, language, duration_ms: Date.now() - started });
    return NextResponse.json(result);
  } catch (error) {
    const status = assistantErrorStatus(error);
    const code = error instanceof Error ? error.message : "ASSISTANT_UNAVAILABLE";
    return NextResponse.json({ error: code.startsWith("ASSISTANT_") || code.startsWith("GEMINI_") ? code : "ASSISTANT_UNAVAILABLE" }, { status });
  }
}
