import { NextResponse } from "next/server";
import { assistantConfig, assistantErrorStatus, assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { startCheckoutAction } from "@/lib/payments/actions";
import { verifyPaymentAction } from "@/lib/payments/actions";
import { startRescheduleAction } from "@/lib/appointments/reschedule-actions";
import { assistantDecisionSchema } from "@/lib/assistant/schemas";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    assertAssistantMutationOrigin(request);
    const { actionId } = await context.params;
    const parsed = assistantDecisionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_ACTION_DECISION" }, { status: 400 });
    const body = parsed.data;
    const access = await requireAssistantPilotAccess("patient");
    const { data: intent, error: intentError } = await access.supabase.from("assistant_action_intents").select("id, action_type, payload, preview, status, expires_at").eq("id", actionId).eq("user_id", access.user.id).maybeSingle();
    if (intentError || !intent) return NextResponse.json({ error: "Action was not found" }, { status: 404 });
    const paymentVerification = body.decision === "payment_verified";
    if ((!paymentVerification && intent.status !== "pending") || (paymentVerification && intent.status !== "awaiting_payment") || new Date(intent.expires_at).getTime() <= Date.now()) {
      await access.supabase.from("assistant_action_intents").update({ status: "expired" }).eq("id", actionId).eq("status", "pending");
      return NextResponse.json({ error: "This confirmation expired. Refresh the appointment and try again.", code: "STALE_ACTION" }, { status: 409 });
    }
    if (body.decision === "payment_verified") {
      if (intent.status !== "awaiting_payment" || !body.paymentId || !body.orderId || !body.providerPaymentId || !body.signature) return NextResponse.json({ error: "STALE_ACTION" }, { status: 409 });
      await verifyPaymentAction({ paymentId: body.paymentId, orderId: body.orderId, providerPaymentId: body.providerPaymentId, signature: body.signature });
      await access.supabase.from("assistant_action_intents").update({ status: "succeeded", executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "awaiting_payment");
      return NextResponse.json({ status: "succeeded" });
    }
    if (body.decision !== "confirm") {
      await access.supabase.from("assistant_action_intents").update({ status: "declined", updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "pending");
      return NextResponse.json({ status: "declined" });
    }
    const { data: claimed } = await access.supabase.from("assistant_action_intents").update({ status: "executing", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "pending").select("action_type, payload").maybeSingle();
    if (!claimed) return NextResponse.json({ error: "This action is already being processed" }, { status: 409 });
    const payload = (claimed.payload ?? {}) as Record<string, unknown>;
    try {
      let result: unknown;
      if (claimed.action_type === "booking") {
        if (assistantConfig.enabled && !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) throw new Error("ASSISTANT_PAYMENT_SANDBOX_REQUIRED");
        result = await startCheckoutAction({ slotId: String(payload.slotId), reason: typeof payload.reason === "string" ? payload.reason : undefined });
      }
      else if (claimed.action_type === "reschedule") result = await startRescheduleAction({ appointmentId: String(payload.appointmentId), targetSlotId: String(payload.targetSlotId) });
      else {
        const { data, error } = await access.supabase.rpc("cancel_paid_appointment", { p_appointment_id: String(payload.appointmentId) });
        if (error) throw new Error(error.message);
        result = data ?? { status: "cancelled" };
      }
      const checkoutRequired = Boolean(result && typeof result === "object" && "orderId" in result && "keyId" in result);
      await access.supabase.from("assistant_action_intents").update({ status: checkoutRequired ? "awaiting_payment" : "succeeded", executed_at: checkoutRequired ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "executing");
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role: "patient", action_type: claimed.action_type, event_type: "confirmed_action", outcome: "succeeded" });
      return NextResponse.json({ status: checkoutRequired ? "payment_required" : "succeeded", result });
    } catch (error) {
      await access.supabase.from("assistant_action_intents").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "executing");
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role: "patient", action_type: claimed.action_type, event_type: "confirmed_action", outcome: "failed", error_code: error instanceof Error ? error.message.slice(0, 120) : "ASSISTANT_ACTION_FAILED" });
      throw error;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSISTANT_ACTION_FAILED";
    return NextResponse.json({ error: code.startsWith("ASSISTANT_") ? code : "ASSISTANT_ACTION_FAILED" }, { status: assistantErrorStatus(error) });
  }
}
