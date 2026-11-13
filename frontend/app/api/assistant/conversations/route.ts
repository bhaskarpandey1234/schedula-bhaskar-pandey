import { NextResponse } from "next/server";
import { assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";

export async function GET(request: Request) {
  try {
    const role = new URL(request.url).searchParams.get("role");
    if (role !== "patient" && role !== "doctor") return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const access = await requireAssistantPilotAccess(role);
    const { data, error } = await access.supabase.from("assistant_conversations").select("id, title, role, created_at, updated_at").eq("user_id", access.user.id).eq("role", role).order("updated_at", { ascending: false });
    if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ASSISTANT_HISTORY_UNAVAILABLE" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertAssistantMutationOrigin(request);
    const body = await request.json().catch(() => null) as { role?: "patient" | "doctor" } | null;
    if (!body || (body.role !== "patient" && body.role !== "doctor")) return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const access = await requireAssistantPilotAccess(body.role);
    const { data, error } = await access.supabase.from("assistant_conversations").insert({ user_id: access.user.id, role: body.role }).select("id, title, role, created_at, updated_at").single();
    if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ASSISTANT_HISTORY_UNAVAILABLE" }, { status: 400 });
  }
}
