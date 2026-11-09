export type ElasticAppointment = {
  appointment_id: string;
  source_slot_id: string;
  patient_id: string;
  patient_name?: string | null;
  start_at: string;
  end_at: string;
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
};

/** Deterministic capacity-aware assignment used by the preview UI. */
export function suggestElasticAssignments(preview: ElasticPreview): ElasticAssignment[] {
  if (preview.scheduling_type === "stream") {
    return preview.appointments.map((appointment) => ({ appointment_id: appointment.appointment_id, source_slot_id: appointment.source_slot_id, target_slot_id: appointment.source_slot_id, action: "moved" }));
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
