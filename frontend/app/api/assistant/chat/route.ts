import { NextResponse } from "next/server";
import { assistantConfig, assistantErrorStatus, assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { runGroqAssistant } from "@/lib/assistant/groq";
import { assistantChatRequestSchema } from "@/lib/assistant/schemas";
import { getAssistantDoctorSlots, getAssistantRescheduleSlots, prepareAssistantCancellationSelection, prepareAssistantElasticDecision, prepareAssistantRescheduleSelection, prepareAssistantSlotSelection } from "@/lib/assistant/tools";

export async function POST(request: Request) {
  const started = Date.now();
  try {
    assertAssistantMutationOrigin(request);
    const parsed = assistantChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    const { role, messages, language, selectedDoctorId, selectedSlotId, selectedProposalDecision, selectedPatientAppointment, selectedRescheduleSlot } = parsed.data;
    const access = await requireAssistantPilotAccess(role);
    try {
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
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, event_type: "chat_turn", outcome: "succeeded", model, language, duration_ms: Date.now() - started });
      return NextResponse.json(publicResult);
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
