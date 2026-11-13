import { localDateKey } from "@/lib/scheduling/time";

export type ElasticAppointment = {
  appointment_id: string;
  source_slot_id: string;
  patient_id: string;
  patient_name?: string | null;
  start_at: string;
  end_at: string;
  created_at?: string;
};

export type ElasticStreamCapacity = {
  minimum_patient_minutes: number;
  original_capacity: number;
  reduced_capacity: number;
  booked_count: number;
  retained_count: number;
  overflow_count: number;
};

export type ElasticCandidate = {
  slot_id: string;
  start_at: string;
  end_at: string;
  remaining_capacity: number;
};

export type ElasticAssignment = {
  appointment_id: string;
  source_slot_id: string;
  target_slot_id: string | null;
  action: "moved" | "cancelled";
};

export type ElasticEditMode = "expansion" | "shrink";

function availabilityErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  if (!error || typeof error !== "object") return "";
  const candidate = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return [candidate.message, candidate.code, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

export function userFacingAvailabilityError(error: unknown) {
  const message = availabilityErrorMessage(error);
  if (message.includes("pgrst202") || message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find the function") || message.includes("function public.preview_doctor_occurrence_adjustment")) return "Elastic scheduling is not enabled in this environment yet. Ask an administrator to apply migration 0036, then refresh the schedule.";
  if (message.includes("active payment hold")) return "An active payment hold is using this occurrence. Wait for checkout to finish or expire, then preview again.";
  if (message.includes("stale") || message.includes("no longer available")) return "Availability changed while you were reviewing it. Refresh the schedule and preview again.";
  if (message.includes("overlap")) return "The new window overlaps another availability session.";
  if (message.includes("3 hours") || message.includes("three hours")) return "This availability can be changed only more than 3 hours before its current start time.";
  if (message.includes("future")) return "Only future availability can be edited.";
  if (message.includes("align")) return "Wave boundaries must align with the appointment duration.";
  if (message.includes("minimum consultation")) return "The new Stream window is too short for one minimum consultation.";
  if (message.includes("pure shrink")) return "Choose a pure shrink or pure expansion; shifting both edges is not supported.";
  return "We could not update this availability. Please review the window and try again.";
}

/** Returns a user-facing validation message, or null when the requested mode is valid. */
export function validateElasticWindow(input: {
  mode: ElasticEditMode;
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
}): string | null {
  const { mode, oldStart, oldEnd, newStart, newEnd } = input;
  if (!newStart || !newEnd || newEnd <= newStart) return "End time must be after the start time.";
  if (newStart === oldStart && newEnd === oldEnd) return "Change at least one boundary before previewing.";
  if (mode === "expansion" && (newStart > oldStart || newEnd < oldEnd)) {
    return "Expansion must keep the current window and add time before or after it.";
  }
  if (mode === "shrink" && (newStart < oldStart || newEnd > oldEnd)) {
    return "Shrinking must stay inside the current availability window.";
  }
  return null;
}

export type ElasticPreview = {
  session_id: string;
  occurrence_date: string;
  timezone: string;
  scheduling_type: "wave" | "stream";
  kind: "weekly" | "monthly" | "custom";
  interval_minutes: number | null;
  classification: "shrink" | "expansion";
  old_start_at: string;
  old_end_at: string;
  new_start_at: string;
  new_end_at: string;
  affected_slots: Array<{ slot_id: string; start_at: string; end_at: string; allocated_count: number; capacity: number }>;
  appointments: ElasticAppointment[];
  candidates: ElasticCandidate[];
  stream_capacity?: ElasticStreamCapacity;
  stream_retained_appointments?: ElasticAppointment[];
  stream_overflow_appointments?: ElasticAppointment[];
};

export function reducedStreamCapacity(originalCapacity: number, startAt: string, endAt: string, minimumPatientMinutes: number) {
  const minutes = Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 60000);
  if (minimumPatientMinutes <= 0 || minutes < minimumPatientMinutes) return 0;
  return Math.min(originalCapacity, Math.floor(minutes / minimumPatientMinutes));
}

export function partitionStreamAppointments(appointments: ElasticAppointment[], retainedCapacity: number) {
  const ordered = [...appointments].sort((left, right) => Date.parse(left.created_at ?? left.start_at) - Date.parse(right.created_at ?? right.start_at) || left.appointment_id.localeCompare(right.appointment_id));
  return { retained: ordered.slice(0, retainedCapacity), overflow: ordered.slice(retainedCapacity) };
}

/**
 * Candidate capacity after accounting for the other choices in this preview.
 * The active booking is deliberately excluded so its current recommendation
 * remains visible while the doctor is deciding whether to change it.
 */
export function availableElasticCandidates(preview: ElasticPreview, assignments: ElasticAssignment[], appointmentId: string) {
  const reserved = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.appointment_id === appointmentId || assignment.action !== "moved" || !assignment.target_slot_id) continue;
    reserved.set(assignment.target_slot_id, (reserved.get(assignment.target_slot_id) ?? 0) + 1);
  }
  return [...preview.candidates]
    .filter((candidate) => candidate.remaining_capacity - (reserved.get(candidate.slot_id) ?? 0) > 0)
    .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at) || left.slot_id.localeCompare(right.slot_id));
}

export function availableElasticCandidateDates(candidates: ElasticCandidate[], timezone: string) {
  return [...new Set(candidates.map((candidate) => localDateKey(candidate.start_at, timezone)))];
}

export function elasticCandidatesForDate(candidates: ElasticCandidate[], date: string, timezone: string) {
  return candidates.filter((candidate) => localDateKey(candidate.start_at, timezone) === date);
}

/** Deterministic capacity-aware assignment used by the preview UI. */
export function suggestElasticAssignments(preview: ElasticPreview): ElasticAssignment[] {
  if (preview.scheduling_type === "stream") {
    if (!preview.stream_overflow_appointments) return preview.appointments.map((appointment) => ({ appointment_id: appointment.appointment_id, source_slot_id: appointment.source_slot_id, target_slot_id: appointment.source_slot_id, action: "moved" as const }));
    return (preview.stream_overflow_appointments ?? []).map((appointment) => ({ appointment_id: appointment.appointment_id, source_slot_id: appointment.source_slot_id, target_slot_id: null, action: "cancelled" as const }));
  }
  const capacity = new Map(preview.candidates.map((candidate) => [candidate.slot_id, candidate.remaining_capacity]));
  const candidates = [...preview.candidates].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const assignments: ElasticAssignment[] = [];
  const appointments = [...preview.appointments].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.appointment_id.localeCompare(b.appointment_id));
  for (const appointment of appointments) {
    const target = candidates.find((candidate) => (capacity.get(candidate.slot_id) ?? 0) > 0 && Date.parse(candidate.start_at) >= Date.parse(appointment.start_at));
    if (target) {
      capacity.set(target.slot_id, (capacity.get(target.slot_id) ?? 1) - 1);
      assignments.push({ appointment_id: appointment.appointment_id, source_slot_id: appointment.source_slot_id, target_slot_id: target.slot_id, action: "moved" });
    } else {
      assignments.push({ appointment_id: appointment.appointment_id, source_slot_id: appointment.source_slot_id, target_slot_id: null, action: "cancelled" });
    }
  }
  return assignments;
}
