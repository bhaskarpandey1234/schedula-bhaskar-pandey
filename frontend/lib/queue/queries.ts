import { createClient } from "@/lib/supabase/server";

export type QueueBoardRow = {
  appointment_id: string;
  doctor_id: string;
  doctor_name: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  slot_id: string;
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

export type QueueDoctor = {
  doctor_id: string;
  doctor_name: string;
  clinic_id: string;
  timezone: string;
};

export type DoctorQueueSummary = {
  slot_start_at: string;
  slot_end_at: string;
  timezone: string;
  total: number;
  remaining: number;
  waiting: number;
  completed: number;
  current_token: number | null;
  next_token: number | null;
};

export type DoctorQueueSlotOption = Pick<QueueBoardRow, "slot_id" | "slot_start_at" | "slot_end_at">;

export type DoctorQueuePatientRow = {
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  slot_id: string;
  slot_start_at: string;
  slot_end_at: string;
  timezone: string;
  token_number: number | null;
  queue_position: number | null;
  queue_status: string | null;
  attendance_status: string | null;
  checked_in_at: string | null;
  appointment_status: string;
  entry_id: string | null;
};

export function parseQueueServiceDate(value: string | undefined, timezone: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getQueueBoard(
  clinicId?: string,
  doctorId?: string,
  serviceDate?: string,
): Promise<QueueBoardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_appointment_board", {
    p_clinic_id: clinicId ?? null,
    p_doctor_id: doctorId ?? null,
    p_service_date: serviceDate ?? null,
    p_slot_id: null,
  });
  if (error) throw new Error("The queue could not be loaded. Please refresh and try again.");
  return (data ?? []) as QueueBoardRow[];
}

export async function getQueueDoctors(clinicId?: string): Promise<QueueDoctor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_doctor_directory", {
    p_clinic_id: clinicId ?? null,
  });
  if (error) throw new Error("The doctor list could not be loaded. Please refresh and try again.");
  return (data ?? []) as QueueDoctor[];
}

export async function getPatientAppointmentQueueToken(appointmentId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_appointment_queue_token", {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error("The appointment queue token could not be loaded.");
  return typeof data === "number" ? data : null;
}

export async function getDoctorQueueSummary(doctorId: string): Promise<DoctorQueueSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_queue_summary", { p_doctor_id: doctorId });
  if (error) throw new Error("The doctor queue summary could not be loaded.");
  return ((data ?? []) as DoctorQueueSummary[])[0] ?? null;
}

export async function getDoctorQueueSummaryForSlot(
  doctorId: string,
  serviceDate: string,
  slotId?: string | null,
): Promise<DoctorQueueSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_queue_summary_for_slot", {
    p_doctor_id: doctorId,
    p_service_date: serviceDate,
    p_slot_id: slotId && slotId !== "all" ? slotId : null,
  });
  if (error) throw new Error("The selected doctor queue could not be loaded.");
  return ((data ?? []) as DoctorQueueSummary[])[0] ?? null;
}

export async function getDoctorQueuePatients(
  doctorId: string,
  serviceDate: string,
  slotId?: string | null,
): Promise<DoctorQueuePatientRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_queue_patients", {
    p_doctor_id: doctorId,
    p_service_date: serviceDate,
    p_slot_id: slotId && slotId !== "all" ? slotId : null,
  });
  if (error) throw new Error("Doctor queue patients could not be loaded.");
  return (data ?? []) as DoctorQueuePatientRow[];
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
