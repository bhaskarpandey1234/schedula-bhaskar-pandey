import { NextResponse } from "next/server";
import { assistantErrorStatus, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { startCheckoutAction } from "@/lib/payments/actions";
import { startRescheduleAction } from "@/lib/appointments/reschedule-actions";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    const { actionId } = await context.params;
    const body = await request.json() as { decision?: "confirm" | "decline" };
    const access = await requireAssistantPilotAccess("patient");
    const { data: intent, error: intentError } = await access.supabase.from("assistant_action_intents").select("id, action_type, payload, preview, status, expires_at").eq("id", actionId).eq("user_id", access.user.id).maybeSingle();
    if (intentError || !intent) return NextResponse.json({ error: "Action was not found" }, { status: 404 });
    if (intent.status !== "pending" || new Date(intent.expires_at).getTime() <= Date.now()) {
      await access.supabase.from("assistant_action_intents").update({ status: "expired" }).eq("id", actionId).eq("status", "pending");
      return NextResponse.json({ error: "This confirmation expired. Refresh the appointment and try again.", code: "STALE_ACTION" }, { status: 409 });
    }
    if (body.decision !== "confirm") {
      await access.supabase.from("assistant_action_intents").update({ status: "declined", updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "pending");
      return NextResponse.json({ status: "declined" });
    }
    const { data: claimed } = await access.supabase.from("assistant_action_intents").update({ status: "executing", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "pending").select("action_type, payload").maybeSingle();
    if (!claimed) return NextResponse.json({ error: "This action is already being processed" }, { status: 409 });
    const payload = (claimed.payload ?? {}) as Record<string, unknown>;
    let result: unknown;
    if (claimed.action_type === "booking") result = await startCheckoutAction({ slotId: String(payload.slotId), reason: typeof payload.reason === "string" ? payload.reason : undefined });
    else if (claimed.action_type === "reschedule") result = await startRescheduleAction({ appointmentId: String(payload.appointmentId), targetSlotId: String(payload.targetSlotId) });
    else {
      const { data, error } = await access.supabase.rpc("cancel_paid_appointment", { p_appointment_id: String(payload.appointmentId) });
      if (error) throw new Error(error.message);
      result = data ?? { status: "cancelled" };
    }
    await access.supabase.from("assistant_action_intents").update({ status: "succeeded", executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId);
    await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role: "patient", action_type: claimed.action_type, event_type: "confirmed_action", outcome: "succeeded" });
    return NextResponse.json({ status: "succeeded", result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed" }, { status: assistantErrorStatus(error) });
  }
}
