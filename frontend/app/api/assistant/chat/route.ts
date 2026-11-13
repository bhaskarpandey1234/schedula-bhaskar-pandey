import { NextResponse } from "next/server";
import { assistantConfig, assistantErrorStatus, assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { runGroqAssistant } from "@/lib/assistant/groq";
import { assistantChatRequestSchema } from "@/lib/assistant/schemas";
import { getAssistantDoctorSlots, getAssistantRescheduleSlots, prepareAssistantCancellationSelection, prepareAssistantElasticDecision, prepareAssistantRescheduleSelection, prepareAssistantSlotSelection } from "@/lib/assistant/tools";
import { conversationTitle, getConversation, persistMessage } from "@/lib/assistant/history";

export async function POST(request: Request) {
  const started = Date.now();
  try {
    assertAssistantMutationOrigin(request);
    const parsed = assistantChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const { role, messages, language, selectedDoctorId, selectedSlotId, selectedProposalDecision, selectedPatientAppointment, selectedRescheduleSlot } = parsed.data;
    const access = await requireAssistantPilotAccess(role);
    try {
      let conversationId = parsed.data.conversationId;
      if (conversationId) {
        const conversation = await getConversation(access.supabase, access.user.id, role, conversationId);
        if (!conversation) throw new Error("ASSISTANT_CONVERSATION_NOT_FOUND");
      } else {
        const { data, error } = await access.supabase.from("assistant_conversations").insert({ user_id: access.user.id, role }).select("id").single();
        if (error || !data) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
        conversationId = data.id;
      }
      if (!conversationId) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
      const resolvedConversationId = conversationId;
      const latestUserMessage = messages.filter((message) => message.role === "user").at(-1)?.text;
      if (!latestUserMessage) throw new Error("INVALID_ASSISTANT_REQUEST");
      await persistMessage(access.supabase, { conversationId: resolvedConversationId, role: "user", text: latestUserMessage });
      await access.supabase.from("assistant_conversations").update({ title: conversationTitle(latestUserMessage) }).eq("id", resolvedConversationId).eq("title", "New conversation");
      const result = selectedSlotId
        ? await prepareAssistantSlotSelection({ slotId: selectedSlotId, language, userId: access.user.id, supabase: access.supabase })
        : selectedPatientAppointment?.action === "cancel"
          ? await prepareAssistantCancellationSelection({ appointmentId: selectedPatientAppointment.appointmentId, userId: access.user.id, supabase: access.supabase })
        : selectedPatientAppointment?.action === "reschedule"
          ? await getAssistantRescheduleSlots({ appointmentId: selectedPatientAppointment.appointmentId, userId: access.user.id, supabase: access.supabase })
        : selectedRescheduleSlot
          ? await prepareAssistantRescheduleSelection({ ...selectedRescheduleSlot, userId: access.user.id, supabase: access.supabase })
        : selectedProposalDecision
          ? { text: "Please review this appointment change before confirming.", displays: [], pendingAction: await prepareAssistantElasticDecision({ ...selectedProposalDecision, userId: access.user.id, supabase: access.supabase }), model: "direct-elastic-decision" }
        : selectedDoctorId
          ? await getAssistantDoctorSlots({ doctorId: selectedDoctorId, language, userId: access.user.id, supabase: access.supabase })
        : await runGroqAssistant({ role, userId: access.user.id, supabase: access.supabase, messages, language });
      const { model, ...publicResult } = result;
      await persistMessage(access.supabase, { conversationId: resolvedConversationId, role: "assistant", text: publicResult.text ?? "I could not complete that request.", displays: publicResult.displays, pendingAction: publicResult.pendingAction });
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, event_type: "chat_turn", outcome: "succeeded", model, language, duration_ms: Date.now() - started });
      return NextResponse.json({ ...publicResult, conversationId: resolvedConversationId });
    } catch (error) {
      const code = error instanceof Error ? error.message : "ASSISTANT_UNAVAILABLE";
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, event_type: "chat_turn", outcome: "failed", model: assistantConfig.textModel, language, error_code: code.startsWith("ASSISTANT_") ? code : "ASSISTANT_UNAVAILABLE", duration_ms: Date.now() - started });
      throw error;
    }
  } catch (error) {
    const status = assistantErrorStatus(error);
    const code = error instanceof Error ? error.message : "ASSISTANT_UNAVAILABLE";
    return NextResponse.json({ error: code.startsWith("ASSISTANT_") ? code : "ASSISTANT_UNAVAILABLE" }, { status });
  }
}
