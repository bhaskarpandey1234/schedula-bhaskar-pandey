import type { Role } from "@/lib/validation/auth";

const paymentNotificationTypes = new Set([
  "payment_confirmed",
  "payment_failed",
  "refund_pending",
  "refund_processed",
  "refund_failed",
]);

export function notificationDestination(role: Role, type: string, appointmentId: string): string {
  const encodedAppointmentId = encodeURIComponent(appointmentId);
  if (role === "doctor") return `/doctor/appointments/${encodedAppointmentId}`;
  const paymentAnchor = paymentNotificationTypes.has(type) ? "#payment" : "";
  return `/patient/appointments/${encodedAppointmentId}/confirmation${paymentAnchor}`;
}
