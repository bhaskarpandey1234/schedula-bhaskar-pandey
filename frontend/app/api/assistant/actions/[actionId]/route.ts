import { NextResponse } from "next/server";
import { assistantConfig, assistantErrorStatus, assertAssistantMutationOrigin, requireAssistantPilotAccess } from "@/lib/assistant/config";
import { startCheckoutAction } from "@/lib/payments/actions";
import { verifyPaymentAction } from "@/lib/payments/actions";
import { startRescheduleAction } from "@/lib/appointments/reschedule-actions";
import { assistantDecisionSchema } from "@/lib/assistant/schemas";
import { availabilitySessionSchema } from "@/lib/validation/availability";
import { deriveRecurrenceEndDate } from "@/lib/scheduling/recurrence";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const doctorActionTypes = new Set(["doctor_cancellation", "doctor_completion", "doctor_prescription", "elastic_adjustment", "availability_creation", "doctor_leave", "doctor_slot_cancellation"]);

async function createDoctorAvailability(supabase: SupabaseClient, payload: Record<string, unknown>) {
  const parsed = availabilitySessionSchema.safeParse(payload);
  if (!parsed.success) throw new Error("INVALID_AVAILABILITY_DETAILS");
  const value = parsed.data;
  const mode = value.sessionType === "recurring" && value.recurrenceMethod === "day" ? "weekly" : value.sessionType === "recurring" ? "monthly_days" : "specific_dates";
  const recurrenceEndDate = value.sessionType === "recurring" && value.recurrenceStartDate && value.recurrenceDuration
    ? deriveRecurrenceEndDate(value.recurrenceStartDate, value.recurrenceDuration as Parameters<typeof deriveRecurrenceEndDate>[1])
    : undefined;
  const scheduleArgs = { p_scheduling_type: value.schedulingType, p_interval_minutes: value.intervalMinutes ?? null, p_capacity: value.capacity };
  const rpcName = mode === "weekly" ? "create_weekly_availability_with_slots" : mode === "monthly_days" ? "create_monthly_availability_with_days" : "create_specific_date_availability_with_slots";
  const args = mode === "weekly"
    ? { p_consulting_days: value.consultingDays, p_recurrence_start_date: value.recurrenceStartDate, p_recurrence_end_date: recurrenceEndDate, p_start_time: value.startTime, p_end_time: value.endTime, p_timezone: value.timezone, ...scheduleArgs }
    : mode === "monthly_days"
      ? { p_monthly_days: value.monthlyDays, p_recurrence_start_date: value.recurrenceStartDate, p_recurrence_end_date: recurrenceEndDate, p_start_time: value.startTime, p_end_time: value.endTime, p_timezone: value.timezone, ...scheduleArgs }
      : { p_session_dates: value.sessionDates, p_start_time: value.startTime, p_end_time: value.endTime, p_timezone: value.timezone, ...scheduleArgs };
  const { data, error } = await supabase.rpc(rpcName, args);
  if (error || !data) throw new Error("AVAILABILITY_CREATION_FAILED");
  if (value.schedulingType === "stream") {
    const sessionIds = (Array.isArray(data) ? data : [data]).filter((item): item is string => typeof item === "string");
    const { error: streamError } = await supabase.rpc("set_stream_min_patient_minutes", { p_session_ids: sessionIds, p_minutes: value.streamMinPatientMinutes ?? 10 });
    if (streamError) throw new Error("AVAILABILITY_CREATION_FAILED");
  }
  return { created: Array.isArray(data) ? data.length : 1 };
}

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    assertAssistantMutationOrigin(request);
    const { actionId } = await context.params;
    const parsed = assistantDecisionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_ACTION_DECISION" }, { status: 400 });
    const body = parsed.data;
    const initialSupabase = await createClient();
    const { data: auth } = await initialSupabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Action was not found" }, { status: 404 });
    const { data: ownedIntent } = await initialSupabase.from("assistant_action_intents").select("action_type").eq("id", actionId).eq("user_id", auth.user.id).maybeSingle();
    if (!ownedIntent) return NextResponse.json({ error: "Action was not found" }, { status: 404 });
    const role = doctorActionTypes.has(ownedIntent.action_type) ? "doctor" : "patient";
    const access = await requireAssistantPilotAccess(role);
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
      const { data: claimed } = await access.supabase.from("assistant_action_intents").update({ status: "executing", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "pending").select("action_type, payload, preview").maybeSingle();
    if (!claimed) return NextResponse.json({ error: "This action is already being processed" }, { status: 409 });
    const payload = (claimed.payload ?? {}) as Record<string, unknown>;
    try {
      let result: unknown;
      if (claimed.action_type === "booking") {
        if (assistantConfig.enabled && !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) throw new Error("ASSISTANT_PAYMENT_SANDBOX_REQUIRED");
        result = await startCheckoutAction({ slotId: String(payload.slotId), reason: typeof payload.reason === "string" ? payload.reason : undefined });
      }
      else if (claimed.action_type === "reschedule") result = await startRescheduleAction({ appointmentId: String(payload.appointmentId), targetSlotId: String(payload.targetSlotId) });
      else if (claimed.action_type === "cancellation") {
        const { data, error } = await access.supabase.rpc("cancel_paid_appointment", { p_appointment_id: String(payload.appointmentId) });
        if (error) throw new Error(error.message);
        result = data ?? { status: "cancelled" };
      } else if (claimed.action_type === "doctor_cancellation") {
        const { error } = await access.supabase.rpc("cancel_doctor_appointment", { p_appointment_id: String(payload.appointmentId) });
        if (error) throw new Error(error.message);
        result = { status: "cancelled" };
      } else if (claimed.action_type === "doctor_completion") {
        const { error } = await access.supabase.rpc("complete_doctor_appointment", { p_appointment_id: String(payload.appointmentId) });
        if (error) throw new Error(error.message);
        result = { status: "completed" };
      } else if (claimed.action_type === "doctor_slot_cancellation") {
        const { error } = await access.supabase.rpc("cancel_doctor_slot", { p_slot_id: String(payload.slotId) });
        if (error) throw new Error(error.message);
        result = { status: "slot_cancelled" };
      } else if (claimed.action_type === "doctor_prescription") {
        const { data, error } = await access.supabase.rpc("publish_doctor_prescription", {
          p_appointment_id: String(payload.appointmentId),
          p_medication_name: String(payload.medicationName),
          p_dosage: String(payload.dosage),
          p_frequency: String(payload.frequency),
          p_duration: String(payload.duration),
          p_instructions: String(payload.instructions ?? ""),
          p_notes: String(payload.notes ?? ""),
        });
        if (error) throw new Error(error.message);
        result = { status: "published", prescriptionId: data };
      } else if (claimed.action_type === "elastic_adjustment") {
        const previewResult = await access.supabase.rpc("preview_doctor_occurrence_adjustment", {
          p_session_id: String(payload.sessionId),
          p_occurrence_date: String(payload.occurrenceDate),
          p_start_time: String(payload.startTime),
          p_end_time: String(payload.endTime),
        });
        const currentPreview = previewResult.data as Record<string, unknown> | null;
        const savedPreview = (claimed.preview ?? {}) as Record<string, unknown>;
        const appointmentTuple = (value: unknown) => {
          if (!value || typeof value !== "object") return value;
          const appointment = value as Record<string, unknown>;
          return [appointment.appointment_id, appointment.patient_name, appointment.start_at, appointment.end_at];
        };
        const currentAppointments = Array.isArray(currentPreview?.appointments) ? currentPreview.appointments.map(appointmentTuple) : [];
        const savedAppointments = Array.isArray(savedPreview.affected_appointments) ? savedPreview.affected_appointments.map((value) => {
          if (!value || typeof value !== "object") return value;
          const appointment = value as Record<string, unknown>;
          return [appointment.appointment_id, appointment.patient_name, appointment.current_start_at, appointment.current_end_at];
        }) : [];
        const candidateTuple = (value: unknown) => {
          if (!value || typeof value !== "object") return value;
          const candidate = value as Record<string, unknown>;
          return [candidate.slot_id, candidate.start_at, candidate.end_at, candidate.remaining_capacity];
        };
        const currentCandidates = Array.isArray(currentPreview?.candidates) ? currentPreview.candidates.map(candidateTuple) : [];
        const savedCandidates = Array.isArray(savedPreview.available_candidates) ? savedPreview.available_candidates.map(candidateTuple) : [];
        const capacityTuple = (value: unknown) => {
          if (!value || typeof value !== "object") return null;
          const capacity = value as Record<string, unknown>;
          return [capacity.minimum_patient_minutes, capacity.original_capacity, capacity.reduced_capacity, capacity.booked_count, capacity.retained_count, capacity.overflow_count];
        };
        const stale = previewResult.error || !currentPreview
          || currentPreview.classification !== savedPreview.classification
          || currentPreview.scheduling_type !== savedPreview.scheduling_type
          || currentPreview.old_start_at !== savedPreview.old_start_at
          || currentPreview.old_end_at !== savedPreview.old_end_at
          || currentPreview.new_start_at !== savedPreview.new_start_at
          || currentPreview.new_end_at !== savedPreview.new_end_at
          || JSON.stringify(currentAppointments) !== JSON.stringify(savedAppointments)
          || JSON.stringify(currentCandidates) !== JSON.stringify(savedCandidates)
          || JSON.stringify(capacityTuple(currentPreview.stream_capacity)) !== JSON.stringify(capacityTuple(savedPreview.stream_capacity));
        if (stale) throw new Error("ASSISTANT_ACTION_STALE");
        const { data, error } = await access.supabase.rpc("apply_doctor_occurrence_adjustment", {
          p_session_id: String(payload.sessionId),
          p_occurrence_date: String(payload.occurrenceDate),
          p_start_time: String(payload.startTime),
          p_end_time: String(payload.endTime),
          p_assignments: [],
        });
        if (error) throw new Error(error.message);
        result = data;
      } else if (claimed.action_type === "availability_creation") {
        result = await createDoctorAvailability(access.supabase, payload);
      } else if (claimed.action_type === "doctor_leave") {
        const leaveArgs = { p_session_id: String(payload.sessionId), p_occurrence_date: String(payload.occurrenceDate) };
        const { error } = await access.supabase.rpc("cancel_doctor_session_occurrence", leaveArgs);
        if (error) throw new Error(error.message);
        const { error: auditError } = await access.supabase.rpc("record_doctor_leave", leaveArgs);
        if (auditError) console.error("Doctor leave audit record failed", { code: auditError.code ?? null });
        result = { status: "cancelled_as_leave" };
      } else if (claimed.action_type === "elastic_proposal_decision") {
        const rpcName = payload.decision === "approve" ? "approve_elastic_booking_proposal" : payload.decision === "choose_slot" ? "choose_elastic_booking_slot" : "reject_elastic_booking_proposal";
        const rpcArgs = payload.decision === "choose_slot"
          ? { p_proposal_id: String(payload.proposalId), p_slot_id: String(payload.slotId) }
          : { p_proposal_id: String(payload.proposalId) };
        const { data, error } = await access.supabase.rpc(rpcName, rpcArgs);
        if (error) throw new Error(error.message);
        result = data;
      } else {
        throw new Error("UNKNOWN_ASSISTANT_ACTION");
      }
      const checkoutRequired = Boolean(result && typeof result === "object" && "orderId" in result && "keyId" in result);
      await access.supabase.from("assistant_action_intents").update({ status: checkoutRequired ? "awaiting_payment" : "succeeded", executed_at: checkoutRequired ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "executing");
      if (claimed.action_type.startsWith("doctor_") || claimed.action_type === "elastic_adjustment" || claimed.action_type === "availability_creation") {
        revalidatePath("/doctor", "page");
        revalidatePath("/doctor/appointments", "page");
        revalidatePath("/doctor/schedule", "page");
        revalidatePath("/doctor/notifications", "page");
        revalidatePath("/patient/appointments", "page");
        revalidatePath("/patient/notifications", "page");
        revalidatePath("/patient/payments", "page");
        revalidatePath("/patient/assistant", "page");
      } else {
        revalidatePath("/patient", "page");
        revalidatePath("/patient/appointments", "page");
        revalidatePath("/patient/notifications", "page");
        revalidatePath("/patient/payments", "page");
        revalidatePath("/doctor", "page");
        revalidatePath("/doctor/appointments", "page");
      }
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, action_type: claimed.action_type, event_type: "confirmed_action", outcome: "succeeded" });
      return NextResponse.json({ status: checkoutRequired ? "payment_required" : "succeeded", result });
    } catch (error) {
      await access.supabase.from("assistant_action_intents").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "executing");
      await access.supabase.from("assistant_audit_events").insert({ user_id: access.user.id, role, action_type: claimed.action_type, event_type: "confirmed_action", outcome: "failed", error_code: error instanceof Error ? error.message.slice(0, 120) : "ASSISTANT_ACTION_FAILED" });
      throw error;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSISTANT_ACTION_FAILED";
    return NextResponse.json({ error: code.startsWith("ASSISTANT_") ? code : "ASSISTANT_ACTION_FAILED" }, { status: assistantErrorStatus(error) });
  }
}
