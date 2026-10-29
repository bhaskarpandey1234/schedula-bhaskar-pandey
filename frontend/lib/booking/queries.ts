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
  const row = ((data ?? []) as Array<{ appointment_id: string; status: "payment_pending" | "confirmed" | "cancelled" | "expired"; reason: string | null; doctor_name: string; clinic_name: string; timezone: string; slot_start_at: string; slot_end_at: string; notification_title: string | null; notification_message: string | null }>)[0];
  if (!row) return null;
  return {
    appointment: { id: row.appointment_id, status: row.status, reason: row.reason },
    doctor: { full_name: row.doctor_name, clinic_name: row.clinic_name, timezone: row.timezone },
    slot: { slot_start_at: row.slot_start_at, slot_end_at: row.slot_end_at },
    notification: row.notification_title ? { title: row.notification_title, message: row.notification_message } : null,
  };
}
