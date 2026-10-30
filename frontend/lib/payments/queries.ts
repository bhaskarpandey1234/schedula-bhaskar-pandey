import { createClient } from "@/lib/supabase/server";

export type PatientPayment = {
  payment_id: string;
  appointment_id: string;
  payment_purpose: "booking" | "reschedule_adjustment";
  payment_status: "creating" | "pending" | "captured" | "failed" | "abandoned" | "expired" | "captured_unallocated";
  amount_minor: number;
  currency: string;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  failure_reason: string | null;
  captured_at: string | null;
  created_at: string;
  doctor_name: string;
  clinic_name: string;
  timezone: string;
  slot_start_at: string;
  slot_end_at: string;
  refund_status: "requested" | "pending" | "processed" | "failed" | null;
  refund_amount_minor: number;
};

export async function getPatientPayments(paymentId?: string) {
  const supabase = await createClient();
  const { data, error } = paymentId
    ? await supabase.rpc("patient_payment_detail", { p_payment_id: paymentId })
    : await supabase.rpc("patient_payment_history");
  if (error) throw new Error(`Payment history query failed: ${error.message}`);
  return (data ?? []) as PatientPayment[];
}
