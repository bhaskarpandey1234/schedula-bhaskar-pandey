import { NextResponse } from "next/server";
import { assistantErrorStatus, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { runAssistantTool } from "@/lib/assistant/tools";
import type { AssistantRole } from "@/lib/assistant/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { role?: AssistantRole; name?: string; args?: Record<string, unknown> };
    const role = body.role === "doctor" ? "doctor" : body.role === "patient" ? "patient" : null;
    if (!role || !body.name) return NextResponse.json({ error: "Invalid tool request" }, { status: 400 });
    const access = await requireAssistantPilotAccess(role);
    const result = await runAssistantTool({ name: body.name, args: body.args ?? {}, role, userId: access.user.id, supabase: access.supabase });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assistant tool failed" }, { status: assistantErrorStatus(error) });
  }
}
