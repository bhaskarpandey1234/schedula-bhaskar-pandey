export type AssistantRole = "doctor" | "patient";

export type AssistantDisplayPayload = {
  kind: "appointments" | "slots" | "doctors" | "payments" | "prescriptions" | "stats" | "message";
  title: string;
  data?: unknown;
};

export type PendingAssistantAction = {
  id: string;
  actionType: "booking" | "reschedule" | "cancellation";
  preview: BookingPreview | CancellationPreview | ReschedulePreview;
  expiresAt: string;
};

type PreviewBase = { timezone?: string; currency?: string; impact?: string };
export type BookingPreview = PreviewBase & { operation: "booking"; doctor_name?: string; clinic_name?: string; slot_start_at?: string; slot_end_at?: string; consultation_fee_minor?: number; reason?: string };
export type CancellationPreview = PreviewBase & { operation: "cancellation"; appointment_id?: string; doctor_name?: string; slot_start_at?: string; refund_amount_minor?: number; refund_status?: string };
export type ReschedulePreview = PreviewBase & { operation: "reschedule"; appointment_id?: string; doctor_name?: string; old_slot_start_at?: string; new_slot_start_at?: string; fee_difference_minor?: number };

export type AssistantToolResult = {
  modelSummary: string;
  display?: AssistantDisplayPayload;
  pendingAction?: PendingAssistantAction;
};
