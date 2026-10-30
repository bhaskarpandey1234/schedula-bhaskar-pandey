import { afterEach, describe, expect, it } from "vitest";
import { sendEmail, sendSms } from "../lib/notifications/providers";

const original = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL, sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, service: process.env.TWILIO_MESSAGING_SERVICE_SID };

afterEach(() => {
  for (const [name, value] of Object.entries({ RESEND_API_KEY: original.key, RESEND_FROM_EMAIL: original.from, TWILIO_ACCOUNT_SID: original.sid, TWILIO_AUTH_TOKEN: original.token, TWILIO_MESSAGING_SERVICE_SID: original.service })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("notification provider adapters", () => {
  it("skips email safely when credentials are absent", async () => {
    delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM_EMAIL;
    await expect(sendEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "delivery-1" })).resolves.toMatchObject({ status: "skipped", errorCode: "provider_not_configured" });
  });

  it("passes a stable idempotency key to the email provider", async () => {
    process.env.RESEND_FROM_EMAIL = "appointments@example.test";
    let received = "";
    const client = { emails: { send: async (_message: unknown, options?: { idempotencyKey?: string }) => { received = options?.idempotencyKey ?? ""; return { data: { id: "email-1" } }; } } };
    await expect(sendEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "delivery-1" }, client)).resolves.toMatchObject({ status: "sent", providerMessageId: "email-1" });
    expect(received).toBe("delivery-1");
  });

  it("does not call Twilio when SMS is not configured", async () => {
    delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    await expect(sendSms({ to: "+919876543210", text: "Reminder", idempotencyKey: "delivery-2" })).resolves.toMatchObject({ status: "skipped", provider: "twilio" });
  });
});
