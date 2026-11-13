import { NextResponse } from "next/server";
import { assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { assistantConversationTitleSchema } from "@/lib/assistant/schemas";
import { getConversation, getHistoryMessages } from "@/lib/assistant/history";

async function accessConversation(request: Request, params: Promise<{ conversationId: string }>) {
  const role = new URL(request.url).searchParams.get("role");
  if (role !== "patient" && role !== "doctor") throw new Error("INVALID_ASSISTANT_REQUEST");
  const access = await requireAssistantPilotAccess(role);
  const { conversationId } = await params;
  const conversation = await getConversation(access.supabase, access.user.id, role, conversationId);
  if (!conversation) throw new Error("ASSISTANT_CONVERSATION_NOT_FOUND");
  return { access, role, conversationId, conversation };
}

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const item = await accessConversation(request, params);
    const messages = await getHistoryMessages(item.access.supabase, item.conversationId);
    return NextResponse.json({ conversation: item.conversation, messages });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSISTANT_HISTORY_UNAVAILABLE" }, { status: 404 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertAssistantMutationOrigin(request);
    const item = await accessConversation(request, params);
    const parsed = assistantConversationTitleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const { data, error } = await item.access.supabase.from("assistant_conversations").update({ title: parsed.data.title, updated_at: new Date().toISOString() }).eq("id", item.conversationId).select("id, title, role, created_at, updated_at").single();
    if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
    return NextResponse.json({ conversation: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSISTANT_HISTORY_UNAVAILABLE" }, { status: 400 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertAssistantMutationOrigin(request);
    const item = await accessConversation(request, params);
    const body = await request.json().catch(() => null) as { text?: unknown } | null;
    if (!body || typeof body.text !== "string" || !body.text.trim() || body.text.length > 4_000) return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const { error } = await item.access.supabase.from("assistant_messages").insert({ conversation_id: item.conversationId, role: "assistant", text: body.text.trim() });
    if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
    await item.access.supabase.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", item.conversationId);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSISTANT_HISTORY_UNAVAILABLE" }, { status: 400 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertAssistantMutationOrigin(request);
    const item = await accessConversation(request, params);
    const { error } = await item.access.supabase.from("assistant_conversations").delete().eq("id", item.conversationId);
    if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
    return new NextResponse(null, { status: 204 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSISTANT_HISTORY_UNAVAILABLE" }, { status: 400 }); }
}
