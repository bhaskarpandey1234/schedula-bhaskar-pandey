import { afterEach, describe, expect, it } from "vitest";
import { sendBrevoEmail, sendEmail, sendSms } from "../lib/notifications/providers";

const original = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL, brevoKey: process.env.BREVO_API_KEY, brevoFrom: process.env.BREVO_FROM_EMAIL, brevoName: process.env.BREVO_FROM_NAME, sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, service: process.env.TWILIO_MESSAGING_SERVICE_SID };

afterEach(() => {
  for (const [name, value] of Object.entries({ RESEND_API_KEY: original.key, RESEND_FROM_EMAIL: original.from, BREVO_API_KEY: original.brevoKey, BREVO_FROM_EMAIL: original.brevoFrom, BREVO_FROM_NAME: original.brevoName, TWILIO_ACCOUNT_SID: original.sid, TWILIO_AUTH_TOKEN: original.token, TWILIO_MESSAGING_SERVICE_SID: original.service })) {
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

  it("does not treat a Resend error response as a successful email", async () => {
    delete process.env.BREVO_API_KEY; delete process.env.BREVO_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = "appointments@example.test";
    const client = { emails: { send: async () => ({ data: null, error: { name: "invalid_from_address" } }) } };
    await expect(sendEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "delivery-2" }, client)).resolves.toEqual({ status: "failed", provider: "resend", errorCode: "provider_rejected", retryable: false });
  });

  it("times out an unresponsive email provider without recording recipient data", async () => {
    delete process.env.BREVO_API_KEY; delete process.env.BREVO_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = "appointments@example.test";
    const client = { emails: { send: async () => new Promise<never>(() => undefined) } };
    await expect(sendEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "delivery-3" }, client, 1)).resolves.toEqual({ status: "failed", provider: "resend", errorCode: "provider_timeout", retryable: true });
  });

  it("uses Brevo when Brevo credentials are configured", async () => {
    process.env.BREVO_API_KEY = "brevo-key";
    process.env.BREVO_FROM_EMAIL = "sender@example.test";
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "api-key": "brevo-key" });
      const body = JSON.parse(String(init?.body));
      expect(body.to[0].email).toBe("patient@example.test");
      expect(body.headers.IdempotencyKey).toBe("delivery-brevo");
      expect(body.tags).toEqual(["schedula"]);
      return new Response(JSON.stringify({ messageId: "brevo-1" }), { status: 201 });
    };
    await expect(sendEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "delivery-brevo" }, fetchImpl, 1000)).resolves.toMatchObject({ status: "sent", provider: "brevo", providerMessageId: "brevo-1" });
  });

  it("classifies Brevo rate limits as retryable and sender errors as permanent", async () => {
    process.env.BREVO_API_KEY = "brevo-key";
    process.env.BREVO_FROM_EMAIL = "sender@example.test";
    const rateLimited = async () => new Response(JSON.stringify({ code: "too_many_requests" }), { status: 429 });
    const rejected = async () => new Response(JSON.stringify({ code: "invalid_parameter" }), { status: 400 });
    await expect(sendBrevoEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "rate" }, rateLimited)).resolves.toMatchObject({ status: "failed", retryable: true });
    await expect(sendBrevoEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "reject" }, rejected)).resolves.toMatchObject({ status: "failed", errorCode: "provider_invalid_request", retryable: false });
  });

  it("rejects display-name sender configuration before calling Brevo", async () => {
    process.env.BREVO_API_KEY = "brevo-key";
    process.env.BREVO_FROM_EMAIL = "Schedula <sender@example.test>";
    let called = false;
    const fetchImpl = async () => { called = true; return new Response(null, { status: 201 }); };
    await expect(sendBrevoEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "invalid-sender" }, fetchImpl)).resolves.toMatchObject({ status: "failed", errorCode: "provider_sender_invalid_config", retryable: false });
    expect(called).toBe(false);
  });

  it("classifies Brevo authentication and recipient errors without exposing payload text", async () => {
    process.env.BREVO_API_KEY = "brevo-key";
    process.env.BREVO_FROM_EMAIL = "sender@example.test";
    const auth = async () => new Response(JSON.stringify({ code: "unauthorized", message: "secret provider detail" }), { status: 401 });
    const recipient = async () => new Response(JSON.stringify({ code: "invalid_email", message: "patient@example.test" }), { status: 400 });
    await expect(sendBrevoEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "auth" }, auth)).resolves.toMatchObject({ status: "failed", errorCode: "provider_authentication_failed", retryable: false });
    await expect(sendBrevoEmail({ to: "patient@example.test", subject: "Test", text: "Test", idempotencyKey: "recipient" }, recipient)).resolves.toMatchObject({ status: "failed", errorCode: "provider_recipient_rejected", retryable: false });
  });

  it("does not call Twilio when SMS is not configured", async () => {
    delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    await expect(sendSms({ to: "+919876543210", text: "Reminder", idempotencyKey: "delivery-2" })).resolves.toMatchObject({ status: "skipped", provider: "twilio" });
  });
});
