import { describe, expect, it } from "vitest";
import { renderNotificationTemplate } from "../lib/notifications/templates";

const input = { template: "appointment_reminder_24h", recipientName: "Patient", recipientRole: "patient" as const, patientName: "Patient", doctorName: "Dr. Rao", clinicName: "River Clinic", timezone: "Asia/Kolkata", slotStartAt: "2099-04-20T09:00:00.000Z", slotEndAt: "2099-04-20T09:30:00.000Z" };

describe("notification templates", () => {
  it("formats the appointment in the doctor timezone and omits visit reasons", () => {
    const rendered = renderNotificationTemplate(input, "email");
    expect(rendered.text).toContain("Asia/Kolkata");
    expect(rendered.text).not.toContain("reason");
  });

  it("keeps SMS content compact", () => expect(renderNotificationTemplate(input, "sms").text.length).toBeLessThanOrEqual(480));

  it("addresses a doctor with the patient name instead of the doctor's own name", () => {
    const rendered = renderNotificationTemplate({ ...input, template: "appointment_booked", recipientName: "Aman", recipientRole: "doctor", patientName: "Raj", doctorName: "Aman" }, "email");
    expect(rendered.text).toContain("Hello Aman");
    expect(rendered.text).toContain("Raj booked a slot");
    expect(rendered.text).not.toContain("appointment with Aman");
  });

  it("keeps patient messages doctor-focused", () => {
    const rendered = renderNotificationTemplate({ ...input, template: "payment_confirmed", recipientName: "Raj", recipientRole: "patient", patientName: "Raj", doctorName: "Aman" }, "email");
    expect(rendered.text).toContain("Hello Raj");
    expect(rendered.text).toContain("appointment with Aman");
    expect(rendered.text).not.toContain("Raj booked a slot");
  });
});
