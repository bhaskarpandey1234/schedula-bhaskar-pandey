import { createClient } from "@/lib/supabase/server";

export type BookableSlot = {
  slot_id: string;
  doctor_id: string;
  full_name: string;
  specialty: string;
  clinic_name: string;
  timezone: string;
  slot_start_at: string;
  slot_end_at: string;
  capacity: number;
  remaining_capacity: number;
  scheduling_type: "wave" | "stream";
  consultation_fee_minor: number | null;
  consultation_currency: string;
};

export async function getBookableSlot(slotId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_bookable_slot", { p_slot_id: slotId });
  if (error) throw new Error(`Booking query failed: ${error.message}`);
  return ((data ?? []) as BookableSlot[])[0] ?? null;
}

export async function getAppointmentConfirmation(appointmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_appointment_confirmation", { p_appointment_id: appointmentId });
  if (error) throw new Error(`Appointment confirmation query failed: ${error.message}`);
  const row = ((data ?? []) as Array<{ appointment_id: string; status: "payment_pending" | "confirmed" | "reschedule_pending" | "cancelled" | "expired"; reason: string | null; doctor_name: string; clinic_name: string; timezone: string; slot_start_at: string; slot_end_at: string; scheduling_type: "wave" | "stream"; notification_title: string | null; notification_message: string | null }>)[0];
  if (!row) return null;
  return {
    appointment: { id: row.appointment_id, status: row.status, reason: row.reason },
    doctor: { full_name: row.doctor_name, clinic_name: row.clinic_name, timezone: row.timezone },
    slot: { slot_start_at: row.slot_start_at, slot_end_at: row.slot_end_at, scheduling_type: row.scheduling_type },
    notification: row.notification_title ? { title: row.notification_title, message: row.notification_message } : null,
  };
}

export type ElasticBookingProposal = {
  proposal_id: string;
  appointment_id: string;
  status: "awaiting_patient" | "approved" | "alternative_selected" | "rejected" | "expired";
  scheduling_type: "wave" | "stream";
  old_start_at: string;
  old_end_at: string;
  recommended_slot_id: string | null;
  recommended_start_at: string | null;
  recommended_end_at: string | null;
  decision_deadline: string;
  timezone: string;
};

export type ElasticProposalCandidate = {
  slot_id: string;
  slot_start_at: string;
  slot_end_at: string;
  remaining_capacity: number;
  timezone: string;
};

export async function getElasticBookingProposal(appointmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_elastic_proposal", { p_appointment_id: appointmentId });
  if (error) throw new Error(`Rescheduling proposal query failed: ${error.message}`);
  const proposal = ((data ?? []) as ElasticBookingProposal[])[0] ?? null;
  if (!proposal) return null;
  const candidatesResult = await supabase.rpc("patient_elastic_candidate_slots", { p_proposal_id: proposal.proposal_id });
  if (candidatesResult.error) throw new Error(`Replacement slot query failed: ${candidatesResult.error.message}`);
  return { proposal, candidates: (candidatesResult.data ?? []) as ElasticProposalCandidate[] };
}
