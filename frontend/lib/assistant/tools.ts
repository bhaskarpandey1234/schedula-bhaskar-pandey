import { createHash, randomUUID } from "node:crypto";
import { getDoctorAppointments, getPatientAppointments } from "@/lib/appointments/queries";
import { getBookableSlot, getAppointmentConfirmation } from "@/lib/booking/queries";
import { getPatientPayments } from "@/lib/payments/queries";
import type { AssistantRole, AssistantToolResult, PendingAssistantAction } from "@/lib/assistant/types";
import { assistantConfig } from "@/lib/assistant/config";
import type { SupabaseClient } from "@supabase/supabase-js";

export const assistantFunctionDeclarations = [
  { type: "function" as const, name: "doctor_appointments", description: "Read this doctor's appointments for a date or tab.", parameters: { type: "object", properties: { date: { type: "string" }, tab: { type: "string", enum: ["upcoming", "past", "cancelled"] } } } },
  { type: "function" as const, name: "doctor_schedule_stats", description: "Read this doctor's schedule counts and conflicts for a date.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { type: "function" as const, name: "doctor_availability", description: "Read this doctor's working hours, shifts, and available slots for a date.", parameters: { type: "object", properties: { date: { type: "string" } } } },
  { type: "function" as const, name: "doctor_leaves", description: "Read this doctor's recorded leave occurrences.", parameters: { type: "object", properties: { date: { type: "string" } } } },
  { type: "function" as const, name: "doctor_next_slot", description: "Find this doctor's next available appointment slot.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "doctor_reschedule_slots", description: "Suggest available slots that could replace an overlapping or cancelled appointment.", parameters: { type: "object", properties: { date: { type: "string" } } } },
  { type: "function" as const, name: "patient_appointments", description: "Read the signed-in patient's appointments.", parameters: { type: "object", properties: { tab: { type: "string", enum: ["upcoming", "past", "cancelled"] } } } },
  { type: "function" as const, name: "search_doctors", description: "Search real bookable doctors by name or specialty.", parameters: { type: "object", properties: { search: { type: "string" }, specialty: { type: "string" } } } },
  { type: "function" as const, name: "doctor_slots", description: "Read real available slots for a doctor.", parameters: { type: "object", properties: { doctorId: { type: "string" } }, required: ["doctorId"] } },
  { type: "function" as const, name: "patient_payments", description: "Read the signed-in patient's payment and refund history.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "patient_prescriptions", description: "Read published prescriptions for the signed-in patient.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "prepare_booking", description: "Prepare a booking preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { slotId: { type: "string" }, reason: { type: "string" } }, required: ["slotId"] } },
  { type: "function" as const, name: "prepare_cancellation", description: "Prepare a cancellation preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { type: "function" as const, name: "prepare_reschedule", description: "Prepare a reschedule preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" }, targetSlotId: { type: "string" } }, required: ["appointmentId", "targetSlotId"] } },
];

export function assistantFunctionDeclarationsForRole(role: AssistantRole) {
  const allowed = role === "doctor"
    ? new Set(["doctor_appointments", "doctor_schedule_stats", "doctor_availability", "doctor_leaves", "doctor_next_slot", "doctor_reschedule_slots"])
    : new Set(["patient_appointments", "search_doctors", "doctor_slots", "patient_payments", "patient_prescriptions", "prepare_booking", "prepare_cancellation", "prepare_reschedule"]);
  return assistantFunctionDeclarations.filter((declaration) => allowed.has(declaration.name));
}

export function assistantFunctionToolsForRole(role: AssistantRole) {
  return assistantFunctionDeclarationsForRole(role).map((declaration) => ({
    type: "function" as const,
    function: declaration,
  }));
}

const modelSummaryKeys = new Set([
  "appointment_id", "appointmentId", "doctor_id", "doctorId", "slot_id", "slotId", "status", "doctor_name", "patient_name", "full_name", "specialty", "clinic_name", "timezone", "slot_start_at", "slot_end_at", "start_at", "end_at", "payment_status", "refund_status", "amount_minor", "payment_amount_minor", "refund_amount_minor", "currency", "medication_name", "dosage", "frequency", "duration", "published_at", "date", "counts", "remaining_capacity", "feeMinor", "consultation_fee_minor",
]);

function summarizeForModel(value: unknown): string {
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => summarizeForModel(item)).join(" | ");
  if (!value || typeof value !== "object") return String(value ?? "");
  return Object.entries(value)
    .filter(([key]) => modelSummaryKeys.has(key))
    .map(([key, item]) => `${key}=${typeof item === "object" ? summarizeForModel(item) : String(item)}`)
    .join(", ");
}

type DoctorScheduleRow = {
  appointment_id: string;
  patient_name: string;
  status: string;
  slot_start_at: string;
  slot_end_at: string;
  scheduling_type?: string;
};

function dateInTimezone(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

async function getDoctorScheduleForDate(date: string) {
  const [upcoming, past, cancelled] = await Promise.all([
    getDoctorAppointments("upcoming"),
    getDoctorAppointments("past"),
    getDoctorAppointments("cancelled"),
  ]);
  const rows = [...upcoming, ...past, ...cancelled] as Array<DoctorScheduleRow & { timezone: string }>;
  const unique = new Map(rows.map((row) => [row.appointment_id, row]));
  return [...unique.values()].filter((row) => dateInTimezone(row.slot_start_at, row.timezone) === date).sort((a, b) => a.slot_start_at.localeCompare(b.slot_start_at));
}

async function getDoctorSlotsForAssistant(supabase: SupabaseClient, doctorId: string, onlyAvailable = false) {
  let query = supabase.from("appointment_slots").select("id, availability_session_id, slot_start_at, slot_end_at, capacity, allocated_count, status").eq("doctor_id", doctorId).gte("slot_start_at", new Date().toISOString()).order("slot_start_at", { ascending: true }).limit(50);
  if (onlyAvailable) query = query.eq("status", "available");
  const { data: slots, error } = await query;
  if (error) throw new Error("DOCTOR_AVAILABILITY_QUERY_FAILED");
  const sessionIds = [...new Set((slots ?? []).map((slot) => slot.availability_session_id))];
  const { data: sessions, error: sessionError } = sessionIds.length
    ? await supabase.from("availability_sessions").select("id, start_time, end_time, timezone, capacity, status, session_date, day_of_week, scheduling_type").in("id", sessionIds)
    : { data: [], error: null };
  if (sessionError) throw new Error("DOCTOR_AVAILABILITY_QUERY_FAILED");
  const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]));
  return (slots ?? []).map((slot) => ({ ...slot, remaining_capacity: Math.max(0, slot.capacity - slot.allocated_count), session: sessionById.get(slot.availability_session_id) ?? null }));
}

async function getPatientPaymentsForAssistant() {
  return getPatientPayments();
}

function textResult(title: string, summary: string, kind: "appointments" | "slots" | "doctors" | "payments" | "prescriptions" | "stats" | "message", data: unknown): AssistantToolResult {
  const details = summarizeForModel(data);
  return { modelSummary: details ? `${summary} Details: ${details}` : summary, display: { kind, title, data } };
}

async function prepareAction(supabase: SupabaseClient, userId: string, role: AssistantRole, actionType: "booking" | "reschedule" | "cancellation", payload: Record<string, unknown>, preview: Record<string, unknown>) {
  const idempotencyKey = `assistant/${userId}/${randomUUID()}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ actionType, payload, preview })).digest("hex");
  const expiresAt = new Date(Date.now() + assistantConfig.confirmationTtlMs).toISOString();
  const { data, error } = await supabase.from("assistant_action_intents").insert({ user_id: userId, role, action_type: actionType, payload, preview, fingerprint, idempotency_key: idempotencyKey, expires_at: expiresAt }).select("id, action_type, preview, expires_at").single();
  if (error || !data) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return { modelSummary: `Confirmation required for ${actionType}.`, pendingAction: { id: data.id, actionType: data.action_type, preview: data.preview as PendingAssistantAction["preview"], expiresAt: data.expires_at } };
}

export async function runAssistantTool(input: { name: string; args: Record<string, unknown>; role: AssistantRole; userId: string; supabase: SupabaseClient }): Promise<AssistantToolResult> {
  const { name, args, role, userId, supabase } = input;
  if (role === "doctor" && (name.startsWith("patient_") || name.startsWith("search_") || name === "doctor_slots" || name.startsWith("prepare_"))) throw new Error("ROLE_TOOL_NOT_ALLOWED");
  if (role === "patient" && (name.startsWith("doctor_") && name !== "doctor_slots")) throw new Error("ROLE_TOOL_NOT_ALLOWED");

  if (name === "doctor_appointments") {
    const tab = typeof args.tab === "string" ? args.tab as "upcoming" | "past" | "cancelled" : "upcoming";
    const requestedDate = typeof args.date === "string" ? args.date : undefined;
    const data = requestedDate
      ? (await getDoctorScheduleForDate(requestedDate)).filter((appointment) => {
        if (tab === "cancelled") return appointment.status === "cancelled";
        if (tab === "past") return appointment.status === "completed";
        return appointment.status !== "cancelled" && appointment.status !== "completed";
      })
      : await getDoctorAppointments(tab);
    return textResult("Doctor appointments", `Found ${data.length} appointments${requestedDate ? ` on ${requestedDate}` : ""}.`, "appointments", data);
  }
  if (name === "doctor_schedule_stats") {
    const date = String(args.date ?? new Date().toISOString().slice(0, 10));
    const appointments = await getDoctorScheduleForDate(date);
    const counts = appointments.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
    const conflicts = appointments.filter((row, index, rows) => rows.some((other, otherIndex) => otherIndex > index && row.slot_start_at < other.slot_end_at && other.slot_start_at < row.slot_end_at));
    return textResult("Schedule statistics", `${appointments.length} appointments on ${date}; ${conflicts.length} possible overlaps.`, "stats", { date, counts, conflicts });
  }
  if (name === "doctor_availability") {
    const date = typeof args.date === "string" ? args.date : undefined;
    const slots = await getDoctorSlotsForAssistant(supabase, userId, false);
    const filtered = date ? slots.filter((slot) => dateInTimezone(slot.slot_start_at, slot.session?.timezone ?? "UTC") === date) : slots;
    return textResult("Doctor availability", `Found ${filtered.length} schedule slots${date ? ` on ${date}` : ""}.`, "slots", filtered);
  }
  if (name === "doctor_leaves") {
    let query = supabase.from("doctor_leave_occurrences").select("occurrence_date, availability_session_id, created_at").eq("doctor_id", userId).order("occurrence_date", { ascending: true });
    if (typeof args.date === "string") query = query.eq("occurrence_date", args.date);
    const { data, error } = await query;
    if (error) throw new Error("DOCTOR_LEAVE_QUERY_FAILED");
    return textResult("Doctor leave", `Found ${data?.length ?? 0} recorded leave occurrences.`, "stats", data ?? []);
  }
  if (name === "doctor_next_slot" || name === "doctor_reschedule_slots") {
    const slots = await getDoctorSlotsForAssistant(supabase, userId, true);
    const available = slots.filter((slot) => slot.remaining_capacity > 0 && slot.session?.status === "active");
    const selected = name === "doctor_reschedule_slots" && typeof args.date === "string"
      ? available.filter((slot) => dateInTimezone(slot.slot_start_at, slot.session?.timezone ?? "UTC") === args.date)
      : available;
    const result = selected.slice(0, name === "doctor_next_slot" ? 1 : 10);
    return textResult(name === "doctor_next_slot" ? "Next available slot" : "Rescheduling candidates", result.length ? `Found ${result.length} suitable slot${result.length === 1 ? "" : "s"}.` : "No suitable available slots were found.", "slots", result);
  }
  if (name === "patient_appointments") {
    const tab = typeof args.tab === "string" ? args.tab as "upcoming" | "past" | "cancelled" : "upcoming";
    const data = await getPatientAppointments(tab);
    return textResult("Your appointments", `Found ${data.length} appointments.`, "appointments", data);
  }
  if (name === "search_doctors") {
    const { data, error } = await supabase.rpc("patient_doctor_directory", { p_search: typeof args.search === "string" ? args.search : null, p_specialty: typeof args.specialty === "string" ? args.specialty : null });
    if (error) throw new Error("DOCTOR_SEARCH_FAILED");
    return textResult("Doctor search", `Found ${data?.length ?? 0} real doctors.`, "doctors", data ?? []);
  }
  if (name === "doctor_slots") {
    const { data, error } = await supabase.rpc("patient_doctor_slots", { p_doctor_id: String(args.doctorId) });
    if (error) throw new Error("DOCTOR_SLOTS_QUERY_FAILED");
    return textResult("Available slots", `Found ${data?.length ?? 0} available slots.`, "slots", data ?? []);
  }
  if (name === "patient_payments") {
    const data = await getPatientPaymentsForAssistant();
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
