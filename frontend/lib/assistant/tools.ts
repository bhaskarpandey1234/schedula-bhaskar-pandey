import { createHash, randomUUID } from "node:crypto";
import { getDoctorAppointments, getDoctorScheduleAppointments, getPatientAppointments } from "@/lib/appointments/queries";
import { getBookableSlot, getAppointmentConfirmation } from "@/lib/booking/queries";
import { getPatientPayments } from "@/lib/payments/queries";
import { searchDoctors, getDoctorSlots } from "@/lib/discovery/directory";
import type { AssistantRole, AssistantToolResult } from "@/lib/assistant/types";
import { assistantConfig } from "@/lib/assistant/config";
import type { SupabaseClient } from "@supabase/supabase-js";

export const assistantFunctionDeclarations = [
  { name: "doctor_appointments", description: "Read this doctor's appointments for a date or tab.", parameters: { type: "object", properties: { date: { type: "string" }, tab: { type: "string", enum: ["upcoming", "past", "cancelled"] } } } },
  { name: "doctor_schedule_stats", description: "Read this doctor's schedule counts and conflicts for a date.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "patient_appointments", description: "Read the signed-in patient's appointments.", parameters: { type: "object", properties: { tab: { type: "string", enum: ["upcoming", "past", "cancelled"] } } } },
  { name: "search_doctors", description: "Search real bookable doctors by name or specialty.", parameters: { type: "object", properties: { search: { type: "string" }, specialty: { type: "string" } } } },
  { name: "doctor_slots", description: "Read real available slots for a doctor.", parameters: { type: "object", properties: { doctorId: { type: "string" } }, required: ["doctorId"] } },
  { name: "patient_payments", description: "Read the signed-in patient's payment and refund history.", parameters: { type: "object", properties: {} } },
  { name: "patient_prescriptions", description: "Read published prescriptions for the signed-in patient.", parameters: { type: "object", properties: {} } },
  { name: "prepare_booking", description: "Prepare a booking preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { slotId: { type: "string" }, reason: { type: "string" } }, required: ["slotId"] } },
  { name: "prepare_cancellation", description: "Prepare a cancellation preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { name: "prepare_reschedule", description: "Prepare a reschedule preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" }, targetSlotId: { type: "string" } }, required: ["appointmentId", "targetSlotId"] } },
];

function textResult(title: string, summary: string, kind: "appointments" | "slots" | "doctors" | "payments" | "prescriptions" | "stats" | "message", data: unknown): AssistantToolResult {
  return { modelSummary: summary, display: { kind, title, data } };
}

async function prepareAction(supabase: SupabaseClient, userId: string, role: AssistantRole, actionType: "booking" | "reschedule" | "cancellation", payload: Record<string, unknown>, preview: Record<string, unknown>) {
  const idempotencyKey = `assistant/${userId}/${randomUUID()}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ actionType, payload, preview })).digest("hex");
  const expiresAt = new Date(Date.now() + assistantConfig.confirmationTtlMs).toISOString();
  const { data, error } = await supabase.from("assistant_action_intents").insert({ user_id: userId, role, action_type: actionType, payload, preview, fingerprint, idempotency_key: idempotencyKey, expires_at: expiresAt }).select("id, action_type, preview, expires_at").single();
  if (error || !data) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return { modelSummary: `Confirmation required for ${actionType}.`, pendingAction: { id: data.id, actionType: data.action_type, preview: data.preview as Record<string, unknown>, expiresAt: data.expires_at } };
}

export async function runAssistantTool(input: { name: string; args: Record<string, unknown>; role: AssistantRole; userId: string; supabase: SupabaseClient }): Promise<AssistantToolResult> {
  const { name, args, role, userId, supabase } = input;
  if (role === "doctor" && (name.startsWith("patient_") || name.startsWith("search_") || name === "doctor_slots" || name.startsWith("prepare_"))) throw new Error("ROLE_TOOL_NOT_ALLOWED");
  if (role === "patient" && (name.startsWith("doctor_") && name !== "doctor_slots")) throw new Error("ROLE_TOOL_NOT_ALLOWED");

  if (name === "doctor_appointments") {
    const tab = typeof args.tab === "string" ? args.tab as "upcoming" | "past" | "cancelled" : "upcoming";
    const data = await getDoctorAppointments(tab);
    return textResult("Doctor appointments", `Found ${data.length} appointments.`, "appointments", data);
  }
  if (name === "doctor_schedule_stats") {
    const date = String(args.date ?? new Date().toISOString().slice(0, 10));
    const appointments = await getDoctorScheduleAppointments(date);
    const counts = appointments.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
    const conflicts = appointments.filter((row, index, rows) => rows.some((other, otherIndex) => otherIndex > index && row.slot_start_at < other.slot_end_at && other.slot_start_at < row.slot_end_at));
    return textResult("Schedule statistics", `${appointments.length} appointments on ${date}; ${conflicts.length} possible overlaps.`, "stats", { date, counts, conflicts });
  }
  if (name === "patient_appointments") {
    const tab = typeof args.tab === "string" ? args.tab as "upcoming" | "past" | "cancelled" : "upcoming";
    const data = await getPatientAppointments(tab);
    return textResult("Your appointments", `Found ${data.length} appointments.`, "appointments", data);
  }
  if (name === "search_doctors") {
    const data = await searchDoctors({ search: typeof args.search === "string" ? args.search : "", specialty: typeof args.specialty === "string" ? args.specialty : "" });
    return textResult("Doctor search", `Found ${data.length} real doctors.`, "doctors", data);
  }
  if (name === "doctor_slots") {
    const data = await getDoctorSlots(String(args.doctorId));
    return textResult("Available slots", `Found ${data.length} available slots.`, "slots", data);
  }
  if (name === "patient_payments") {
    const data = await getPatientPayments();
    return textResult("Payment history", `Found ${data.length} payment records.`, "payments", data);
  }
  if (name === "patient_prescriptions") {
    const { data, error } = await supabase.from("prescriptions").select("id, appointment_id, notes, published_at, prescription_items(*)").eq("patient_id", userId).eq("status", "published").order("published_at", { ascending: false });
    if (error) throw new Error("PRESCRIPTION_QUERY_FAILED");
    return textResult("Published prescriptions", `Found ${data?.length ?? 0} published prescriptions.`, "prescriptions", data ?? []);
  }
  if (name === "prepare_booking") {
    if (role !== "patient") throw new Error("ROLE_TOOL_NOT_ALLOWED");
    const slot = await getBookableSlot(String(args.slotId));
    if (!slot) throw new Error("SLOT_UNAVAILABLE");
    return prepareAction(supabase, userId, role, "booking", { slotId: slot.slot_id, reason: typeof args.reason === "string" ? args.reason : null }, { doctorName: slot.full_name, start: slot.slot_start_at, end: slot.slot_end_at, timezone: slot.timezone, feeMinor: slot.consultation_fee_minor, currency: slot.consultation_currency });
  }
  if (name === "prepare_cancellation") {
    if (role !== "patient") throw new Error("ROLE_TOOL_NOT_ALLOWED");
    const confirmation = await getAppointmentConfirmation(String(args.appointmentId));
    if (!confirmation) throw new Error("APPOINTMENT_NOT_FOUND");
    return prepareAction(supabase, userId, role, "cancellation", { appointmentId: confirmation.appointment.id }, { doctorName: confirmation.doctor.full_name, start: confirmation.slot.slot_start_at, end: confirmation.slot.slot_end_at, timezone: confirmation.doctor.timezone, refund: "Eligibility will be calculated by the existing cancellation policy." });
  }
  if (name === "prepare_reschedule") {
    if (role !== "patient") throw new Error("ROLE_TOOL_NOT_ALLOWED");
    const [confirmation, slot] = await Promise.all([getAppointmentConfirmation(String(args.appointmentId)), getBookableSlot(String(args.targetSlotId))]);
    if (!confirmation || !slot) throw new Error("RESCHEDULE_SLOT_UNAVAILABLE");
    return prepareAction(supabase, userId, role, "reschedule", { appointmentId: confirmation.appointment.id, targetSlotId: slot.slot_id }, { doctorName: slot.full_name, start: slot.slot_start_at, end: slot.slot_end_at, timezone: slot.timezone, feeMinor: slot.consultation_fee_minor, currency: slot.consultation_currency });
  }
  throw new Error("UNKNOWN_ASSISTANT_TOOL");
}
