import { Resend } from "resend";

export const EMAIL_PROVIDER_TIMEOUT_MS = 10_000;

export type ProviderResult = { status: "sent" | "failed" | "skipped" | "ambiguous"; provider: string; providerMessageId?: string; errorCode?: string; retryable?: boolean };
export type EmailClient = { emails: { send(message: { from: string; to: string; subject: string; text: string }, options?: { idempotencyKey?: string; signal?: AbortSignal }): Promise<{ data?: { id?: string } | null; error?: { name?: string } | null } | unknown> } };
export type BrevoFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function resendFailure(result: unknown): ProviderResult | null {
  if (typeof result !== "object" || result === null || !("error" in result) || !result.error) return null;
  const name = typeof result.error === "object" && result.error !== null && "name" in result.error && typeof result.error.name === "string" ? result.error.name : "";
  if (name === "rate_limit_exceeded") return { status: "failed", provider: "resend", errorCode: "provider_rate_limited", retryable: true };
  if (name === "internal_server_error" || name === "application_error") return { status: "failed", provider: "resend", errorCode: "provider_unavailable", retryable: true };
  return { status: "failed", provider: "resend", errorCode: "provider_rejected", retryable: false };
}

export async function sendEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }, client?: EmailClient | BrevoFetch, timeoutMs = EMAIL_PROVIDER_TIMEOUT_MS): Promise<ProviderResult> {
  if (process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL) return sendBrevoEmail(input, typeof client === "function" ? client : fetch, timeoutMs);
  return sendResendEmail(input, typeof client === "function" ? undefined : client, timeoutMs);
}

async function sendResendEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }, client?: EmailClient, timeoutMs = EMAIL_PROVIDER_TIMEOUT_MS): Promise<ProviderResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from || (!apiKey && !client)) return { status: "skipped", provider: "resend", errorCode: "provider_not_configured" };
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = (client ?? new Resend(apiKey!)).emails.send(
      { from, to: input.to, subject: input.subject, text: input.text },
      { idempotencyKey: input.idempotencyKey, signal: controller.signal },
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("provider_timeout"));
      }, timeoutMs);
    });
    const result = await Promise.race([request, timeout]);
    const failed = resendFailure(result);
    if (failed) return failed;
    const id = typeof result === "object" && result !== null && "data" in result ? (result as { data?: { id?: string } }).data?.id : undefined;
    if (!id) return { status: "failed", provider: "resend", errorCode: "provider_invalid_response", retryable: true };
    return { status: "sent", provider: "resend", providerMessageId: id };
  } catch {
    return { status: "failed", provider: "resend", errorCode: timedOut ? "provider_timeout" : "provider_error", retryable: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function brevoFailure(status: number, payload: unknown): ProviderResult {
  const code = typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string" ? payload.code.toLowerCase() : "";
  if (status === 401) return { status: "failed", provider: "brevo", errorCode: "provider_authentication_failed", retryable: false };
  if (status === 403 || code === "permission_denied") return { status: "failed", provider: "brevo", errorCode: "provider_account_restricted", retryable: false };
  if (status === 429 || status >= 500 || code === "too_many_requests") return { status: "failed", provider: "brevo", errorCode: status === 429 ? "provider_rate_limited" : "provider_unavailable", retryable: true };
  if (code === "invalid_sender" || code === "sender_not_verified") return { status: "failed", provider: "brevo", errorCode: "provider_sender_rejected", retryable: false };
  if (code === "invalid_email" || code === "invalid_recipient") return { status: "failed", provider: "brevo", errorCode: "provider_recipient_rejected", retryable: false };
  if (code === "invalid_parameter") return { status: "failed", provider: "brevo", errorCode: "provider_invalid_request", retryable: false };
  return { status: "failed", provider: "brevo", errorCode: "provider_rejected", retryable: false };
}

export async function sendBrevoEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }, fetchImpl: BrevoFetch = fetch, timeoutMs = EMAIL_PROVIDER_TIMEOUT_MS): Promise<ProviderResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.BREVO_FROM_EMAIL?.trim();
  const fromName = process.env.BREVO_FROM_NAME || "Schedula";
  if (!apiKey || !from) return { status: "skipped", provider: "brevo", errorCode: "provider_not_configured" };
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) return { status: "failed", provider: "brevo", errorCode: "provider_sender_invalid_config", retryable: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ sender: { name: fromName, email: from }, to: [{ email: input.to }], subject: input.subject, textContent: input.text, headers: { IdempotencyKey: input.idempotencyKey }, tags: ["schedula"] }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as { messageId?: string } & Record<string, unknown>;
    if (!response.ok) return brevoFailure(response.status, payload);
    if (!payload.messageId) return { status: "failed", provider: "brevo", errorCode: "provider_invalid_response", retryable: true };
    return { status: "sent", provider: "brevo", providerMessageId: payload.messageId };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { status: "ambiguous", provider: "brevo", errorCode: "provider_timeout", retryable: false };
    return { status: "failed", provider: "brevo", errorCode: "provider_error", retryable: true };
  } finally {
    clearTimeout(timer);
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
