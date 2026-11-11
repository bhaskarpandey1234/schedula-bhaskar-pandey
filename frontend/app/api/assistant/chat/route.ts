import { NextResponse } from "next/server";
import { assistantErrorStatus, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { runGeminiAssistant } from "@/lib/assistant/gemini";
import type { AssistantRole } from "@/lib/assistant/types";

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const body = await request.json() as { role?: AssistantRole; messages?: Array<{ role: "user" | "model"; text: string }>; language?: string };
    const role = body.role === "doctor" ? "doctor" : body.role === "patient" ? "patient" : null;
    if (!role || !Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) return NextResponse.json({ error: "Invalid assistant request" }, { status: 400 });
    const access = await requireAssistantPilotAccess(role);
    const result = await runGeminiAssistant({ role, userId: access.user.id, supabase: access.supabase, messages: body.messages, language: body.language });
    await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, event_type: "chat_turn", outcome: "succeeded", model: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash", language: body.language ?? "auto", duration_ms: Date.now() - started });
    return NextResponse.json(result);
  } catch (error) {
    const status = assistantErrorStatus(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assistant unavailable" }, { status });
  }
}
