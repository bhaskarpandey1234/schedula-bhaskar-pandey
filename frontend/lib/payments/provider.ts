import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentOrder = { id: string; amount: number; currency: string; receipt: string };
export type ProviderPayment = { id: string; orderId: string; amount: number; currency: string; status: string };
export type ProviderRefund = { id: string; paymentId: string; amount: number; status: string };

export interface PaymentProvider {
  createOrder(input: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<PaymentOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  createRefund(input: { paymentId: string; amountMinor: number; receipt: string }): Promise<ProviderRefund>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

export function safeSignatureCompare(expected: string, actual: string) {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RazorpayProvider implements PaymentProvider {
  private readonly keyId = process.env.RAZORPAY_KEY_ID ?? "";
  private readonly keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  private readonly webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  private readonly endpoint = "https://api.razorpay.com/v1";

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.keyId || !this.keySecret) throw new Error("Razorpay server credentials are not configured");
    const response = await fetch(`${this.endpoint}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Razorpay request failed (${response.status})`);
    return response.json() as Promise<T>;
  }

  async createOrder(input: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> }) {
    return this.request<PaymentOrder>("/orders", { method: "POST", body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt, payment_capture: 1, notes: input.notes }) });
  }

  async fetchPayment(paymentId: string) {
    const payment = await this.request<{ id: string; order_id: string; amount: number; currency: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
    return { id: payment.id, orderId: payment.order_id, amount: payment.amount, currency: payment.currency, status: payment.status };
  }

  async createRefund(input: { paymentId: string; amountMinor: number; receipt: string }) {
    const refund = await this.request<{ id: string; payment_id: string; amount: number; status: string }>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, { method: "POST", body: JSON.stringify({ amount: input.amountMinor, receipt: input.receipt }) });
    return { id: refund.id, paymentId: refund.payment_id, amount: refund.amount, status: refund.status };
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }) {
    if (!this.keySecret) return false;
    const expected = createHmac("sha256", this.keySecret).update(`${input.orderId}|${input.paymentId}`).digest("hex");
    return safeSignatureCompare(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    if (!this.webhookSecret) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return safeSignatureCompare(expected, signature);
  }
}

export function getPaymentProvider(): PaymentProvider { return new RazorpayProvider(); }
