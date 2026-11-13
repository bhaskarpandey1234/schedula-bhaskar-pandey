import type { AssistantDisplayPayload, AssistantRole, PendingAssistantAction } from "@/lib/assistant/types";

type Supabase = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type AssistantHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  displays?: AssistantDisplayPayload[];
  pendingAction?: PendingAssistantAction;
  createdAt: string;
  staleAction?: boolean;
};

export type AssistantConversationSummary = { id: string; title: string; role: AssistantRole; createdAt: string; updatedAt: string };

export function conversationTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return (normalized.slice(0, 72) || "New conversation").replace(/[.?!,:;]+$/, "");
}

export async function getConversation(supabase: Supabase, userId: string, role: AssistantRole, conversationId: string) {
  const { data, error } = await supabase.from("assistant_conversations")
    .select("id, title, role, created_at, updated_at")
    .eq("id", conversationId).eq("user_id", userId).eq("role", role).maybeSingle();
  if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
  return data;
}

export async function getHistoryMessages(supabase: Supabase, conversationId: string): Promise<AssistantHistoryMessage[]> {
  const { data, error } = await supabase.from("assistant_messages")
    .select("id, role, text, display_payloads, pending_action, created_at")
    .eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
  const actionIds = (data ?? []).map((item) => (item.pending_action as { id?: string } | null)?.id).filter((id): id is string => Boolean(id));
  const { data: actions } = actionIds.length
    ? await supabase.from("assistant_action_intents").select("id, status, expires_at").in("id", actionIds)
    : { data: [] as Array<{ id: string; status: string; expires_at: string }> };
  const actionState = new Map((actions ?? []).map((item) => [item.id, item]));
  return (data ?? []).map((item) => {
    const pendingAction = item.pending_action as PendingAssistantAction | null;
    const state = pendingAction ? actionState.get(pendingAction.id) : undefined;
    const staleAction = Boolean(pendingAction && (!state || state.status !== "pending" || new Date(state.expires_at).getTime() <= Date.now()));
    return {
      id: item.id,
      role: item.role as "user" | "assistant",
      text: item.text,
      displays: item.display_payloads as AssistantDisplayPayload[] | undefined,
      pendingAction: staleAction ? undefined : pendingAction ?? undefined,
      createdAt: item.created_at,
      staleAction,
    };
  });
}

export async function persistMessage(supabase: Supabase, input: { conversationId: string; role: "user" | "assistant"; text: string; displays?: AssistantDisplayPayload[]; pendingAction?: PendingAssistantAction }) {
  const { error } = await supabase.from("assistant_messages").insert({
    conversation_id: input.conversationId,
    role: input.role,
    text: input.text,
    display_payloads: input.displays ?? null,
    pending_action: input.pendingAction ?? null,
  });
  if (error) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
  const { error: updateError } = await supabase.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", input.conversationId);
  if (updateError) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
}
