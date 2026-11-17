import { createClient } from "@/lib/supabase/server";

export type QueueBoardRow = {
  appointment_id: string;
  doctor_id: string;
  doctor_name: string;
  patient_name: string;
  slot_start_at: string;
  slot_end_at: string;
  timezone: string;
  appointment_status: string;
  attendance_status: string | null;
  checked_in_at: string | null;
  token_number: number | null;
  queue_status: string | null;
  queue_position: number | null;
  no_show_eligible_at: string;
  called_at: string | null;
  entry_id: string | null;
};

export type PatientQueueRow = Pick<QueueBoardRow,
  "appointment_id" | "checked_in_at" | "attendance_status" | "token_number" | "queue_status" | "queue_position">;

export async function getQueueBoard(clinicId?: string, doctorId?: string): Promise<QueueBoardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_appointment_board", {
    p_clinic_id: clinicId ?? null,
    p_doctor_id: doctorId ?? null,
  });
  if (error) throw new Error("The queue could not be loaded. Please refresh and try again.");
  return (data ?? []) as QueueBoardRow[];
}

export async function getPatientQueueStatus(): Promise<PatientQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_queue_status");
  if (error) throw new Error("Your check-in status could not be loaded.");
  return (data ?? []) as PatientQueueRow[];
}

export function tokenLabel(token: number | null) {
  return token === null ? "—" : `T${String(token).padStart(3, "0")}`;
}
