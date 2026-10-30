import { Resend } from "resend";

export type ProviderResult = { status: "sent" | "failed" | "skipped" | "ambiguous"; provider: string; providerMessageId?: string; errorCode?: string };
export type EmailClient = { emails: { send(message: { from: string; to: string; subject: string; text: string }, options?: { idempotencyKey?: string }): Promise<{ data?: { id?: string } | null } | unknown> } };

export async function sendEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }, client?: EmailClient): Promise<ProviderResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from || (!apiKey && !client)) return { status: "skipped", provider: "resend", errorCode: "provider_not_configured" };
  try {
    const result = await (client ?? new Resend(apiKey!)).emails.send({ from, to: input.to, subject: input.subject, text: input.text }, { idempotencyKey: input.idempotencyKey });
    const id = typeof result === "object" && result !== null && "data" in result ? (result as { data?: { id?: string } }).data?.id : undefined;
    return { status: "sent", provider: "resend", providerMessageId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "email_provider_error";
    return { status: "failed", provider: "resend", errorCode: message.slice(0, 120) };
  }
}

export async function sendSms(input: { to: string; text: string; idempotencyKey: string }): Promise<ProviderResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !messagingService) return { status: "skipped", provider: "twilio", errorCode: "provider_not_configured" };
  const body = new URLSearchParams({ To: input.to, Body: input.text, MessagingServiceSid: messagingService, StatusCallback: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/webhooks/twilio/status` });
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "X-Schedula-Idempotency-Key": input.idempotencyKey }, body });
    const payload = await response.json().catch(() => ({})) as { sid?: string; code?: number; message?: string };
    if (!response.ok) return { status: response.status >= 500 || response.status === 429 ? "failed" : "failed", provider: "twilio", errorCode: String(payload.code ?? response.status) };
    return { status: "sent", provider: "twilio", providerMessageId: payload.sid };
  } catch {
    return { status: "ambiguous", provider: "twilio", errorCode: "network_timeout" };
  }
}
