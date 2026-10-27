import { afterEach, describe, expect, it } from "vitest";
import { sendBookingConfirmationEmail } from "../lib/email";

const originalApiKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM_EMAIL;
const details = {
  to: "patient@example.test",
  doctorName: "Dr. Asha Rao",
  clinicName: "River Clinic",
  timezone: "Asia/Kolkata",
  slotStartAt: "2099-04-20T09:00:00.000Z",
  slotEndAt: "2099-04-20T09:30:00.000Z",
  reason: null,
};

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
  if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalFrom;
});

describe("booking confirmation delivery", () => {
  it("skips optional email when it is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    await expect(sendBookingConfirmationEmail(details)).resolves.toBe("skipped");
  });

  it("returns a safe failure result when the provider rejects delivery", async () => {
    process.env.RESEND_FROM_EMAIL = "appointments@example.test";
    const client = { emails: { send: async () => { throw new Error("provider unavailable"); } } };
    await expect(sendBookingConfirmationEmail(details, client)).resolves.toBe("failed");
  });
});
