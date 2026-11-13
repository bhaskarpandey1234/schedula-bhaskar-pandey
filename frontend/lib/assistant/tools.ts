import { createHash, randomUUID } from "node:crypto";
import { getDoctorAppointments, getDoctorAppointmentDetail, getPatientAppointments } from "@/lib/appointments/queries";
import { getBookableSlot, getAppointmentConfirmation } from "@/lib/booking/queries";
import { getPatientPayments } from "@/lib/payments/queries";
import { availabilitySessionSchema } from "@/lib/validation/availability";
import type { AssistantDisplayPayload, AssistantRole, AssistantToolResult, PendingAssistantAction } from "@/lib/assistant/types";
import { assistantConfig } from "@/lib/assistant/config";
import { assistantGroundedResultText, assistantSelectedSlotText } from "@/lib/assistant/presentation";
import type { SupabaseClient } from "@supabase/supabase-js";

export const assistantFunctionDeclarations = [
  { type: "function" as const, name: "doctor_appointments", description: "Read this doctor's appointments for a date or tab.", parameters: { type: "object", properties: { date: { type: "string" }, tab: { type: "string", enum: ["upcoming", "past", "cancelled"] } } } },
  { type: "function" as const, name: "doctor_schedule_stats", description: "Read this doctor's schedule counts and conflicts for a date.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { type: "function" as const, name: "doctor_availability", description: "Read this doctor's working hours, shifts, and available slots for a date.", parameters: { type: "object", properties: { date: { type: "string" } } } },
  { type: "function" as const, name: "doctor_leaves", description: "Read this doctor's recorded leave occurrences.", parameters: { type: "object", properties: { date: { type: "string" } } } },
  { type: "function" as const, name: "doctor_next_slot", description: "Find this doctor's next available appointment slot.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "doctor_reschedule_slots", description: "Suggest available slots that could replace an overlapping or cancelled appointment.", parameters: { type: "object", properties: { date: { type: "string" } } } },
  { type: "function" as const, name: "doctor_pending_proposals", description: "Read patient responses still pending after this doctor's elastic schedule changes.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "prepare_doctor_cancellation", description: "Prepare a doctor appointment cancellation preview. Requires explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { type: "function" as const, name: "prepare_doctor_slot_cancellation", description: "Prepare cancellation of an unbooked future doctor availability slot. Requires explicit confirmation.", parameters: { type: "object", properties: { slotId: { type: "string" } }, required: ["slotId"] } },
  { type: "function" as const, name: "prepare_doctor_completion", description: "Prepare to mark an eligible appointment completed. Requires explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { type: "function" as const, name: "prepare_doctor_prescription", description: "Prepare a prescription using only medication details explicitly supplied by the doctor. Never invent or recommend medication. Requires explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" }, medicationName: { type: "string" }, dosage: { type: "string" }, frequency: { type: "string" }, duration: { type: "string" }, instructions: { type: "string" }, notes: { type: "string" } }, required: ["appointmentId", "medicationName", "dosage", "frequency", "duration"] } },
  { type: "function" as const, name: "prepare_elastic_adjustment", description: "Preview and prepare a doctor-owned occurrence expansion or shrink. Requires explicit confirmation before applying and notifying affected patients.", parameters: { type: "object", properties: { sessionId: { type: "string" }, occurrenceDate: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } }, required: ["sessionId", "occurrenceDate", "startTime", "endTime"] } },
  { type: "function" as const, name: "prepare_availability_creation", description: "Prepare doctor availability creation from explicit schedule details. Requires confirmation.", parameters: { type: "object", properties: { sessionType: { type: "string", enum: ["recurring", "specific_date"] }, recurrenceMethod: { type: "string", enum: ["day", "date"] }, schedulingType: { type: "string", enum: ["wave", "stream"] }, sessionDates: { type: "array", items: { type: "string" } }, recurrenceStartDate: { type: "string" }, recurrenceDuration: { type: "string" }, monthlyDays: { type: "array", items: { type: "number" } }, consultingDays: { type: "array", items: { type: "number" } }, startTime: { type: "string" }, endTime: { type: "string" }, timezone: { type: "string" }, intervalMinutes: { type: "number" }, streamMinPatientMinutes: { type: "number" }, capacity: { type: "number" } }, required: ["sessionType", "schedulingType", "startTime", "endTime", "timezone", "capacity"] } },
  { type: "function" as const, name: "prepare_doctor_leave", description: "Prepare to cancel a doctor's availability occurrence as leave. Requires explicit confirmation and patient notifications.", parameters: { type: "object", properties: { sessionId: { type: "string" }, occurrenceDate: { type: "string" } }, required: ["sessionId", "occurrenceDate"] } },
  { type: "function" as const, name: "patient_appointments", description: "Read the signed-in patient's appointments.", parameters: { type: "object", properties: { tab: { type: "string", enum: ["upcoming", "past", "cancelled"] } } } },
  { type: "function" as const, name: "search_doctors", description: "Search real, email-confirmed bookable doctors by name or specialty.", parameters: { type: "object", properties: { search: { type: "string" }, specialty: { type: "string" } } } },
  { type: "function" as const, name: "doctor_slots", description: "Read real available slots for an email-confirmed doctor, optionally filtered to a local date.", parameters: { type: "object", properties: { doctorId: { type: "string" }, date: { type: "string" } }, required: ["doctorId"] } },
  { type: "function" as const, name: "patient_payments", description: "Read the signed-in patient's payment and refund history.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "patient_prescriptions", description: "Read published prescriptions for the signed-in patient.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "patient_elastic_proposals", description: "Read appointment changes requiring this patient's decision, with alternatives and deadlines.", parameters: { type: "object", properties: {} } },
  { type: "function" as const, name: "prepare_cancellation", description: "Prepare a cancellation preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { type: "function" as const, name: "prepare_reschedule", description: "Prepare a reschedule preview; never execute without explicit confirmation.", parameters: { type: "object", properties: { appointmentId: { type: "string" }, targetSlotId: { type: "string" } }, required: ["appointmentId", "targetSlotId"] } },
];

export function assistantFunctionDeclarationsForRole(role: AssistantRole) {
  const allowed = role === "doctor"
    ? new Set(["doctor_appointments", "doctor_schedule_stats", "doctor_availability", "doctor_leaves", "doctor_next_slot", "doctor_reschedule_slots", "doctor_pending_proposals", "prepare_doctor_cancellation", "prepare_doctor_slot_cancellation", "prepare_doctor_completion", "prepare_doctor_prescription", "prepare_elastic_adjustment", "prepare_availability_creation", "prepare_doctor_leave"])
    : new Set(["patient_appointments", "search_doctors", "doctor_slots", "patient_payments", "patient_prescriptions", "patient_elastic_proposals", "prepare_cancellation", "prepare_reschedule"]);
  return assistantFunctionDeclarations.filter((declaration) => allowed.has(declaration.name));
}

export function assistantFunctionToolsForRole(role: AssistantRole) {
  return assistantFunctionDeclarationsForRole(role).map((declaration) => ({
    type: "function" as const,
    function: declaration,
  }));
}

const modelSummaryKeys = new Set([
  "appointment_id", "appointmentId", "doctor_id", "doctorId", "availability_session_id", "session_id", "id", "slot_id", "slotId", "status", "doctor_name", "patient_name", "full_name", "specialty", "clinic_name", "timezone", "slot_start_at", "slot_end_at", "start_at", "end_at", "payment_status", "refund_status", "amount_minor", "payment_amount_minor", "refund_amount_minor", "currency", "published_at", "date", "counts", "remaining_capacity",
]);

export function summarizeForModel(value: unknown): string {
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
  const { error: materializeError } = await supabase.rpc("materialize_recurring_availability_slots", { p_doctor_id: doctorId });
  if (materializeError) throw new Error("DOCTOR_AVAILABILITY_QUERY_FAILED");
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

async function prepareAction(supabase: SupabaseClient, userId: string, role: AssistantRole, actionType: PendingAssistantAction["actionType"], payload: Record<string, unknown>, preview: Record<string, unknown>) {
  const idempotencyKey = `assistant/${userId}/${randomUUID()}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ actionType, payload, preview })).digest("hex");
  const expiresAt = new Date(Date.now() + assistantConfig.confirmationTtlMs).toISOString();
  const { data, error } = await supabase.from("assistant_action_intents").insert({ user_id: userId, role, action_type: actionType, payload, preview, fingerprint, idempotency_key: idempotencyKey, expires_at: expiresAt }).select("id, action_type, preview, expires_at").single();
  if (error || !data) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return { modelSummary: `Confirmation required for ${actionType}.`, pendingAction: { id: data.id, actionType: data.action_type, preview: data.preview as PendingAssistantAction["preview"], expiresAt: data.expires_at } };
}

async function getVerifiedBookableSlot(supabase: SupabaseClient, slotId: string) {
  const slot = await getBookableSlot(slotId);
  if (!slot) return null;
  const { data: verifiedSlots, error } = await supabase.rpc("assistant_patient_doctor_slots", { p_doctor_id: slot.doctor_id });
  if (error) throw new Error("DOCTOR_SLOTS_QUERY_FAILED");
  const hasVerifiedSlot = Array.isArray(verifiedSlots) && verifiedSlots.some((value: unknown) => (
    value !== null
    && typeof value === "object"
    && "slot_id" in value
    && value.slot_id === slot.slot_id
  ));
  return hasVerifiedSlot ? slot : null;
}

async function prepareAssistantBookingAction(input: {
  slotId: string;
  reason?: string | null;
  userId: string;
  supabase: SupabaseClient;
}) {
  const slot = await getVerifiedBookableSlot(input.supabase, input.slotId);
  if (!slot) throw new Error("SLOT_UNAVAILABLE");
  return prepareAction(input.supabase, input.userId, "patient", "booking", { slotId: slot.slot_id, reason: input.reason ?? null }, {
    doctor_name: slot.full_name,
    clinic_name: slot.clinic_name,
    slot_start_at: slot.slot_start_at,
    slot_end_at: slot.slot_end_at,
    timezone: slot.timezone,
    consultation_fee_minor: slot.consultation_fee_minor,
    consultation_currency: slot.consultation_currency,
  });
}

export async function runAssistantTool(input: { name: string; args: Record<string, unknown>; role: AssistantRole; userId: string; supabase: SupabaseClient }): Promise<AssistantToolResult> {
  const { name, args, role, userId, supabase } = input;
  if (!assistantFunctionDeclarationsForRole(role).some((declaration) => declaration.name === name)) throw new Error("ROLE_TOOL_NOT_ALLOWED");
  if (role === "doctor" && (name.startsWith("patient_") || name.startsWith("search_") || name === "doctor_slots")) throw new Error("ROLE_TOOL_NOT_ALLOWED");
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
  if (name === "doctor_pending_proposals") {
    const { data, error } = await supabase.from("elastic_booking_proposals").select("id, appointment_id, status, old_start_at, old_end_at, recommended_start_at, recommended_end_at, decision_deadline").eq("doctor_id", userId).eq("status", "awaiting_patient").order("decision_deadline", { ascending: true }).limit(50);
    if (error) throw new Error("DOCTOR_PROPOSALS_QUERY_FAILED");
    return textResult("Pending patient decisions", `There are ${data?.length ?? 0} pending patient decisions.`, "stats", data ?? []);
  }
  if (name === "prepare_doctor_cancellation" || name === "prepare_doctor_completion") {
    const appointmentId = String(args.appointmentId ?? "");
    const appointment = await getDoctorAppointmentDetail(appointmentId);
    if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
    if (name === "prepare_doctor_cancellation" && !appointment.is_cancellable) throw new Error("APPOINTMENT_NOT_CANCELLABLE");
    if (name === "prepare_doctor_completion" && (appointment.status !== "confirmed" || new Date(appointment.slot_start_at).getTime() > Date.now())) throw new Error("APPOINTMENT_NOT_COMPLETABLE");
    const actionType = name === "prepare_doctor_cancellation" ? "doctor_cancellation" : "doctor_completion";
    return prepareAction(supabase, userId, role, actionType, { appointmentId }, {
      operation: actionType,
      appointment_id: appointment.appointment_id,
      patient_name: appointment.patient_name,
      clinic_name: appointment.clinic_name,
      status: appointment.status,
      slot_start_at: appointment.slot_start_at,
      slot_end_at: appointment.slot_end_at,
      timezone: appointment.timezone,
      impact: name === "prepare_doctor_cancellation" ? "The patient will be notified that this appointment is cancelled." : "The appointment will be marked completed.",
    });
  }
  if (name === "prepare_doctor_slot_cancellation") {
    const slotId = String(args.slotId ?? "");
    const { data: slot, error } = await supabase.from("appointment_slots").select("id, availability_session_id, slot_start_at, slot_end_at, allocated_count, status").eq("id", slotId).eq("doctor_id", userId).maybeSingle();
    if (error || !slot || slot.status !== "available" || new Date(slot.slot_start_at).getTime() <= Date.now()) throw new Error("DOCTOR_SLOT_NOT_CANCELLABLE");
    if (slot.allocated_count > 0) throw new Error("DOCTOR_SLOT_HAS_BOOKING");
    return prepareAction(supabase, userId, role, "doctor_slot_cancellation", { slotId }, {
      operation: "doctor_slot_cancellation",
      slot_id: slot.id,
      start_at: slot.slot_start_at,
      end_at: slot.slot_end_at,
      impact: "This future slot will be removed from patient availability.",
    });
  }
  if (name === "prepare_doctor_prescription") {
    const appointmentId = String(args.appointmentId ?? "");
    const appointment = await getDoctorAppointmentDetail(appointmentId);
    if (!appointment || appointment.status !== "completed") throw new Error("PRESCRIPTION_REQUIRES_COMPLETED_APPOINTMENT");
    const prescription = Object.fromEntries(["medicationName", "dosage", "frequency", "duration", "instructions", "notes"].map((key) => [key, typeof args[key] === "string" ? String(args[key]).trim() : ""]));
    if (["medicationName", "dosage", "frequency", "duration"].some((key) => !prescription[key])) throw new Error("PRESCRIPTION_FIELDS_REQUIRED");
    if (Object.values(prescription).some((value) => value.length > 1000)) throw new Error("PRESCRIPTION_FIELDS_TOO_LONG");
    return prepareAction(supabase, userId, role, "doctor_prescription", { appointmentId, ...prescription }, {
      operation: "doctor_prescription",
      appointment_id: appointment.appointment_id,
      patient_name: appointment.patient_name,
      medication_name: prescription.medicationName,
      dosage: prescription.dosage,
      frequency: prescription.frequency,
      duration: prescription.duration,
      instructions: prescription.instructions,
      notes: prescription.notes,
      impact: "This prescription will be published to the patient. Confirm all clinical details before publishing.",
    });
  }
  if (name === "prepare_elastic_adjustment") {
    const sessionId = String(args.sessionId ?? "");
    const occurrenceDate = String(args.occurrenceDate ?? "");
    const startTime = String(args.startTime ?? "");
    const endTime = String(args.endTime ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) throw new Error("INVALID_ELASTIC_ADJUSTMENT");
    const { data, error } = await supabase.rpc("preview_doctor_occurrence_adjustment", { p_session_id: sessionId, p_occurrence_date: occurrenceDate, p_start_time: startTime, p_end_time: endTime });
    if (error || !data || typeof data !== "object") throw new Error("ELASTIC_PREVIEW_FAILED");
    const preview = data as Record<string, unknown>;
    const affectedAppointments = Array.isArray(preview.appointments) ? preview.appointments.map((value) => {
      if (!value || typeof value !== "object") return value;
      const appointment = value as Record<string, unknown>;
      return { appointment_id: appointment.appointment_id, patient_name: appointment.patient_name, current_start_at: appointment.start_at, current_end_at: appointment.end_at };
    }) : [];
    const assignments = affectedAppointments.length;
    return prepareAction(supabase, userId, role, "elastic_adjustment", { sessionId, occurrenceDate, startTime, endTime }, {
      operation: "elastic_adjustment",
      classification: preview.classification,
      scheduling_type: preview.scheduling_type,
      timezone: preview.timezone,
      old_start_at: preview.old_start_at,
      old_end_at: preview.old_end_at,
      new_start_at: preview.new_start_at,
      new_end_at: preview.new_end_at,
      affected_appointments: affectedAppointments,
      available_candidates: preview.candidates,
      stream_capacity: preview.stream_capacity,
      impact: `${assignments} patients require a decision. Confirming updates availability and notifies affected patients; patient appointments remain pending until they respond.`,
    });
  }
  if (name === "prepare_availability_creation") {
    const parsed = availabilitySessionSchema.safeParse(args);
    if (!parsed.success) throw new Error("INVALID_AVAILABILITY_DETAILS");
    return prepareAction(supabase, userId, role, "availability_creation", parsed.data as unknown as Record<string, unknown>, {
      operation: "availability_creation",
      session_type: parsed.data.sessionType,
      recurrence_method: parsed.data.recurrenceMethod,
      scheduling_type: parsed.data.schedulingType,
      session_dates: parsed.data.sessionDates,
      recurrence_start_date: parsed.data.recurrenceStartDate,
      recurrence_duration: parsed.data.recurrenceDuration,
      consulting_days: parsed.data.consultingDays,
      monthly_days: parsed.data.monthlyDays,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
      timezone: parsed.data.timezone,
      interval_minutes: parsed.data.intervalMinutes,
      stream_min_patient_minutes: parsed.data.streamMinPatientMinutes,
      capacity: parsed.data.capacity,
    });
  }
  if (name === "prepare_doctor_leave") {
    const sessionId = String(args.sessionId ?? "");
    const occurrenceDate = String(args.occurrenceDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) throw new Error("INVALID_LEAVE_DATE");
    const { data: session, error } = await supabase.from("availability_sessions").select("id, start_time, end_time, timezone, scheduling_type").eq("id", sessionId).eq("doctor_id", userId).eq("status", "active").maybeSingle();
    if (error || !session) throw new Error("AVAILABILITY_SESSION_NOT_FOUND");
    if (occurrenceDate <= new Intl.DateTimeFormat("en-CA", { timeZone: session.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())) throw new Error("INVALID_LEAVE_DATE");
    const occurrenceSlots = await getDoctorSlotsForAssistant(supabase, userId, false);
    const affectedBookedSlots = occurrenceSlots.filter((slot) => slot.availability_session_id === sessionId && slot.allocated_count > 0 && dateInTimezone(slot.slot_start_at, session.timezone) === occurrenceDate).length;
    return prepareAction(supabase, userId, role, "doctor_leave", { sessionId, occurrenceDate }, {
      operation: "doctor_leave",
      date: occurrenceDate,
      start_time: session.start_time,
      end_time: session.end_time,
      timezone: session.timezone,
      affected_booked_slots: affectedBookedSlots,
      impact: "This occurrence will be cancelled and affected patients will be notified.",
    });
  }
  if (name === "patient_appointments") {
    const tab = typeof args.tab === "string" ? args.tab as "upcoming" | "past" | "cancelled" : "upcoming";
    const data = await getPatientAppointments(tab);
    return textResult("Your appointments", `Found ${data.length} appointments.`, "appointments", data);
  }
  if (name === "search_doctors") {
    const { data, error } = await supabase.rpc("assistant_patient_doctor_directory", { p_search: typeof args.search === "string" ? args.search : null, p_specialty: typeof args.specialty === "string" ? args.specialty : null });
    if (error) throw new Error("DOCTOR_SEARCH_FAILED");
    return textResult("Verified doctors", `Found ${data?.length ?? 0} verified doctors.`, "doctors", data ?? []);
  }
  if (name === "doctor_slots") {
    const { data, error } = await supabase.rpc("assistant_patient_doctor_slots", { p_doctor_id: String(args.doctorId) });
    if (error) throw new Error("DOCTOR_SLOTS_QUERY_FAILED");
    const requestedDate = typeof args.date === "string" ? args.date : undefined;
    const filtered = requestedDate ? (data ?? []).filter((slot: { slot_start_at?: string; timezone?: string }) => slot.slot_start_at && dateInTimezone(slot.slot_start_at, slot.timezone ?? "UTC") === requestedDate) : data ?? [];
    return textResult("Available slots", `Found ${filtered.length} available slots${requestedDate ? ` on ${requestedDate}` : ""}.`, "slots", filtered);
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
  if (name === "patient_elastic_proposals") {
    const { data, error } = await supabase.from("elastic_booking_proposals").select("id, appointment_id, status, scheduling_type, old_start_at, old_end_at, recommended_slot_id, recommended_start_at, recommended_end_at, decision_deadline").eq("patient_id", userId).eq("status", "awaiting_patient").gt("decision_deadline", new Date().toISOString()).order("decision_deadline", { ascending: true }).limit(20);
    if (error) throw new Error("PATIENT_PROPOSALS_QUERY_FAILED");
    const proposals = await Promise.all((data ?? []).map(async (proposal) => {
      const { data: candidates, error: candidateError } = await supabase.rpc("patient_elastic_candidate_slots", { p_proposal_id: proposal.id });
      if (candidateError) throw new Error("PATIENT_PROPOSAL_SLOTS_FAILED");
      const confirmation = await getAppointmentConfirmation(proposal.appointment_id);
      return { ...proposal, timezone: confirmation?.doctor.timezone ?? "Asia/Kolkata", doctor_name: confirmation?.doctor.full_name ?? "Your doctor", candidates: candidates ?? [] };
    }));
    return { modelSummary: `Found ${proposals.length} pending appointment changes.`, display: { kind: "elastic_proposals", title: "Appointment changes needing your decision", data: proposals } };
  }
  if (name === "prepare_cancellation") {
    if (role !== "patient") throw new Error("ROLE_TOOL_NOT_ALLOWED");
    const confirmation = await getAppointmentConfirmation(String(args.appointmentId));
    if (!confirmation) throw new Error("APPOINTMENT_NOT_FOUND");
    if (confirmation.appointment.status !== "confirmed") throw new Error("APPOINTMENT_NOT_CANCELLABLE");
    return prepareAction(supabase, userId, role, "cancellation", { appointmentId: confirmation.appointment.id }, { operation: "cancellation", doctorName: confirmation.doctor.full_name, start: confirmation.slot.slot_start_at, end: confirmation.slot.slot_end_at, timezone: confirmation.doctor.timezone, refund: "Eligibility will be calculated by the existing cancellation policy." });
  }
  if (name === "prepare_reschedule") {
    if (role !== "patient") throw new Error("ROLE_TOOL_NOT_ALLOWED");
    const [confirmation, slot] = await Promise.all([getAppointmentConfirmation(String(args.appointmentId)), getVerifiedBookableSlot(supabase, String(args.targetSlotId))]);
    if (!confirmation || !slot) throw new Error("RESCHEDULE_SLOT_UNAVAILABLE");
    const { data: eligibleSlots, error: eligibilityError } = await supabase.rpc("assistant_patient_reschedule_slots", { p_appointment_id: confirmation.appointment.id });
    if (eligibilityError || !Array.isArray(eligibleSlots) || !eligibleSlots.some((value: { slot_id?: string }) => value.slot_id === slot.slot_id)) throw new Error("RESCHEDULE_SLOT_UNAVAILABLE");
    return prepareAction(supabase, userId, role, "reschedule", { appointmentId: confirmation.appointment.id, targetSlotId: slot.slot_id }, { doctorName: slot.full_name, start: slot.slot_start_at, end: slot.slot_end_at, timezone: slot.timezone, feeMinor: slot.consultation_fee_minor, currency: slot.consultation_currency });
  }
  throw new Error("UNKNOWN_ASSISTANT_TOOL");
}

export async function prepareAssistantSlotSelection(input: {
  slotId: string;
  language: string;
  userId: string;
  supabase: SupabaseClient;
}) {
  const result = await prepareAssistantBookingAction({
    slotId: input.slotId,
    userId: input.userId,
    supabase: input.supabase,
  });
  if (!result.pendingAction) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return {
    text: assistantSelectedSlotText(input.language),
    displays: [] as AssistantDisplayPayload[],
    pendingAction: result.pendingAction,
    model: "direct-slot-selection",
  };
}

export async function prepareAssistantElasticDecision(input: {
  proposalId: string;
  decision: "approve" | "cancel" | "choose_slot";
  slotId?: string;
  userId: string;
  supabase: SupabaseClient;
}) {
  const { data: proposal, error } = await input.supabase.from("elastic_booking_proposals")
    .select("id, appointment_id, status, old_start_at, old_end_at, recommended_slot_id, recommended_start_at, recommended_end_at, decision_deadline")
    .eq("id", input.proposalId).eq("patient_id", input.userId).eq("status", "awaiting_patient").maybeSingle();
  if (error || !proposal || new Date(proposal.decision_deadline).getTime() <= Date.now()) throw new Error("ELASTIC_PROPOSAL_STALE");
  let slotId = input.slotId;
  if (input.decision === "approve") slotId = proposal.recommended_slot_id ?? undefined;
  if (input.decision !== "cancel") {
    if (!slotId) throw new Error("ELASTIC_SLOT_REQUIRED");
    const { data: candidates, error: candidatesError } = await input.supabase.rpc("patient_elastic_candidate_slots", { p_proposal_id: proposal.id });
    if (candidatesError || !Array.isArray(candidates) || !candidates.some((candidate: { slot_id?: string }) => candidate.slot_id === slotId) && slotId !== proposal.recommended_slot_id) throw new Error("ELASTIC_SLOT_UNAVAILABLE");
  }
  const decision = input.decision === "cancel" ? "cancel" : input.decision === "approve" ? "approve" : "choose_slot";
  const actionType = "elastic_proposal_decision";
  const preview = {
    operation: "elastic_proposal_decision",
    decision,
    appointment_id: proposal.appointment_id,
    current_start_at: proposal.old_start_at,
    recommended_start_at: proposal.recommended_start_at,
    recommended_end_at: proposal.recommended_end_at,
    selected_slot_id: slotId ?? null,
    decision_deadline: proposal.decision_deadline,
    impact: decision === "cancel" ? "This appointment will be cancelled and a full refund will be requested when applicable." : "This will accept the selected replacement time and update the appointment.",
  };
  const result = await prepareAction(input.supabase, input.userId, "patient", actionType, { proposalId: proposal.id, decision, slotId: slotId ?? null }, preview);
  if (!result.pendingAction) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return result.pendingAction;
}

export async function getAssistantRescheduleSlots(input: { appointmentId: string; userId: string; supabase: SupabaseClient }) {
  const { data, error } = await input.supabase.rpc("assistant_patient_reschedule_slots", { p_appointment_id: input.appointmentId });
  if (error) throw new Error("RESCHEDULE_SLOTS_QUERY_FAILED");
  const slots = Array.isArray(data) ? data.map((slot) => ({ ...slot, appointment_id: input.appointmentId })) : [];
  return {
    text: slots.length ? `Found ${slots.length} available same-doctor rescheduling options.` : "No available same-doctor rescheduling options were found.",
    displays: [{ kind: "reschedule_slots", title: "Choose a replacement appointment time", data: slots } as AssistantDisplayPayload],
    pendingAction: undefined,
    model: "direct-reschedule-slots",
  };
}

export async function prepareAssistantCancellationSelection(input: { appointmentId: string; userId: string; supabase: SupabaseClient }) {
  const confirmation = await getAppointmentConfirmation(input.appointmentId);
  if (!confirmation || confirmation.appointment.status !== "confirmed") throw new Error("APPOINTMENT_NOT_CANCELLABLE");
  const result = await prepareAction(input.supabase, input.userId, "patient", "cancellation", { appointmentId: confirmation.appointment.id }, {
    operation: "cancellation",
    appointment_id: confirmation.appointment.id,
    doctor_name: confirmation.doctor.full_name,
    slot_start_at: confirmation.slot.slot_start_at,
    slot_end_at: confirmation.slot.slot_end_at,
    timezone: confirmation.doctor.timezone,
    impact: "Cancellation policy and applicable refund status will be applied by Schedula.",
  });
  if (!result.pendingAction) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return { text: "Review the appointment and cancellation impact before confirming.", displays: [], pendingAction: result.pendingAction, model: "direct-cancellation-selection" };
}

export async function prepareAssistantRescheduleSelection(input: { appointmentId: string; slotId: string; userId: string; supabase: SupabaseClient }) {
  const result = await runAssistantTool({
    name: "prepare_reschedule",
    args: { appointmentId: input.appointmentId, targetSlotId: input.slotId },
    role: "patient",
    userId: input.userId,
    supabase: input.supabase,
  });
  if (!result.pendingAction) throw new Error("ASSISTANT_ACTION_PREPARE_FAILED");
  return { text: "Review the replacement appointment and any payment adjustment before confirming.", displays: [], pendingAction: result.pendingAction, model: "direct-reschedule-selection" };
}

export async function getAssistantDoctorSlots(input: {
  doctorId: string;
  language: string;
  userId: string;
  supabase: SupabaseClient;
}) {
  const result = await runAssistantTool({
    name: "doctor_slots",
    args: { doctorId: input.doctorId },
    role: "patient",
    userId: input.userId,
    supabase: input.supabase,
  });
  if (!result.display || result.display.kind !== "slots") throw new Error("DOCTOR_SLOTS_QUERY_FAILED");
  const count = Array.isArray(result.display.data) ? result.display.data.length : 0;
  return {
    text: assistantGroundedResultText("slots", count, input.language),
    displays: [result.display],
    pendingAction: undefined,
    model: "direct-doctor-slot-lookup",
  };
}
