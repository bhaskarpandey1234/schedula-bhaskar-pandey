import { describe, expect, it } from "vitest";
import { notificationDestination } from "../lib/notifications/destinations";

const appointmentId = "acc4ca44-3156-4c68-b126-2b8638c81177";

describe("notification destinations", () => {
  it("opens patient financial notifications at the appointment payment section", () => {
    for (const type of ["payment_confirmed", "payment_failed", "refund_pending", "refund_processed", "refund_failed"]) {
      expect(notificationDestination("patient", type, appointmentId)).toBe(`/patient/appointments/${appointmentId}/confirmation#payment`);
    }
  });

  it("opens patient appointment notifications at the appointment detail", () => {
    for (const type of ["appointment_booked", "appointment_cancelled", "appointment_rescheduled", "appointment_reminder", "future_type"]) {
      expect(notificationDestination("patient", type, appointmentId)).toBe(`/patient/appointments/${appointmentId}/confirmation`);
    }
  });

  it("opens every doctor notification at the doctor appointment detail", () => {
    expect(notificationDestination("doctor", "appointment_booked", appointmentId)).toBe(`/doctor/appointments/${appointmentId}`);
    expect(notificationDestination("doctor", "future_type", appointmentId)).toBe(`/doctor/appointments/${appointmentId}`);
  });
});
