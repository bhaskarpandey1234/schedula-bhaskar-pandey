import { describe, expect, it } from "vitest";
import { renderNotificationTemplate } from "../lib/notifications/templates";

const input = { template: "appointment_reminder_24h", recipientName: "Patient", doctorName: "Dr. Rao", clinicName: "River Clinic", timezone: "Asia/Kolkata", slotStartAt: "2099-04-20T09:00:00.000Z", slotEndAt: "2099-04-20T09:30:00.000Z" };

describe("notification templates", () => {
  it("formats the appointment in the doctor timezone and omits visit reasons", () => {
    const rendered = renderNotificationTemplate(input, "email");
    expect(rendered.text).toContain("Asia/Kolkata");
    expect(rendered.text).not.toContain("reason");
  });

  it("keeps SMS content compact", () => expect(renderNotificationTemplate(input, "sms").text.length).toBeLessThanOrEqual(480));
});
