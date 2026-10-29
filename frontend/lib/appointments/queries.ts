import { createClient } from "@/lib/supabase/server";
import { appointmentTabSchema, type AppointmentTab } from "@/lib/validation/appointments";

export type PatientAppointment = {
  appointment_id: string;
  status: "payment_pending" | "confirmed" | "cancelled" | "expired";
  reason: string | null;
  doctor_name: string;
  specialty: string;
  clinic_name: string;
  timezone: string;
  slot_start_at: string;
  slot_end_at: string;
  payment_status: "creating" | "pending" | "captured" | "failed" | "abandoned" | "expired" | "captured_unallocated" | null;
  payment_amount_minor: number | null;
  refund_status: "requested" | "pending" | "processed" | "failed" | null;
  refund_amount_minor: number | null;
};

export async function getPatientAppointments(tab: AppointmentTab) {
  const parsed = appointmentTabSchema.parse(tab);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_appointments", { p_tab: parsed });
  if (error) throw new Error(`Appointment query failed: ${error.message}`);
  return (data ?? []) as PatientAppointment[];
}

export type DoctorScheduleAppointment = {
  appointment_id: string;
  slot_id: string;
  patient_name: string;
  status: "confirmed" | "cancelled";
  slot_start_at: string;
  slot_end_at: string;
};

export async function getDoctorScheduleAppointments(sessionDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_schedule_appointments", { p_session_date: sessionDate });
  if (error) throw new Error(`Doctor appointment query failed: ${error.message}`);
  return (data ?? []) as DoctorScheduleAppointment[];
}

export type DoctorAppointment = {
  appointment_id: string;
  patient_name: string;
  status: "confirmed" | "cancelled";
  reason: string | null;
  clinic_name: string;
  timezone: string;
  slot_start_at: string;
  slot_end_at: string;
};

export async function getDoctorAppointments(tab: "upcoming" | "past" | "cancelled" = "upcoming") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_appointments", { p_tab: tab });
  if (error) throw new Error(`Doctor appointment query failed: ${error.message}`);
  return (data ?? []) as DoctorAppointment[];
}
