import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { paymentWebhookEvents } from "@/lib/db/schema";
import { sendNotificationEmail } from "@/lib/email";
import { getPaymentProvider } from "@/lib/payments/provider";
import { PaymentProviderError } from "@/lib/payments/provider";
import { isRetryableRefundError, normalizeProviderRefundState, safeRefundFailureReason } from "@/lib/payments/refund-state";

async function applyRefundState(db: ReturnType<typeof createDb>, refundId: string, state: "pending" | "processed" | "failed", failureReason?: string | null) {
  return db.transaction(async (tx) => {
    const changed = await tx.execute(sql`
      UPDATE public.refunds
      SET status = CASE
            WHEN status = 'processed'::refund_status THEN status
            ELSE ${state}::refund_status
          END,
          processed_at = CASE WHEN ${state} = 'processed' THEN COALESCE(processed_at, now()) ELSE processed_at END,
          processing_started_at = NULL,
          failure_reason = ${failureReason ?? null},
          updated_at = now()
      WHERE id = ${refundId}::uuid
      RETURNING request_id, status::text AS status
    `);
    const row = (changed as unknown as Array<{ request_id: string; status: string }>)[0];
    if (!row || row.status === "requested" || row.status === "pending") return row;
    await tx.execute(sql`
      UPDATE public.refund_requests
      SET status = CASE
            WHEN status = 'processed'::refund_status THEN status
            ELSE ${row.status}::refund_status
          END,
          updated_at = now()
      WHERE id = ${row.request_id}::uuid
    `);
    if (row.status === "processed" || row.status === "failed") {
      await tx.execute(sql`
        INSERT INTO public.notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
        SELECT a.patient_id, rr.appointment_id,
          ${row.status === "processed" ? "refund_processed" : "refund_failed"}::notification_type,
          ${row.status === "processed" ? "Refund processed" : "Refund failed"},
          ${row.status === "processed" ? "Your payment provider has confirmed the refund." : "Your refund could not be completed. Please contact support if the issue continues."},
          ${row.status === "processed" ? "refund-processed/" : "refund-failed/"} || r.id::text
        FROM public.refunds r
        JOIN public.refund_requests rr ON rr.id = r.request_id
        JOIN public.appointments a ON a.id = rr.appointment_id
        WHERE r.id = ${refundId}::uuid
        ON CONFLICT DO NOTHING
      `);
    }
    return row;
  });
}

export async function POST(request: Request) {
  const expected = process.env.JOB_RUNNER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-job-secret");
  if (!expected || supplied !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createDb();
  const expired = await db.execute(sql`select public.expire_payment_holds() as count`);
  const events = await db.select().from(paymentWebhookEvents).where(inArray(paymentWebhookEvents.status, ["pending", "failed"])).limit(50);
  let processed = 0;
  for (const event of events) {
    try {
      const parsed = JSON.parse(event.payload) as { event?: string; entityId?: string; orderId?: string };
      if (parsed.event === "payment.captured" && parsed.entityId) {
        const paymentRows = await db.execute(sql`select id from public.payments where provider_payment_id = ${parsed.entityId} or provider_order_id = ${parsed.orderId ?? ""} limit 1`);
        const paymentId = (paymentRows as unknown as Array<{ id: string }>)[0]?.id;
        if (paymentId) await db.execute(sql`select public.complete_payment(${paymentId}::uuid, ${parsed.entityId}, 'captured')`);
      }
      if ((parsed.event === "refund.processed" || parsed.event === "refund.failed") && parsed.entityId) {
        const refundStatus = parsed.event === "refund.processed" ? "processed" : "failed";
        const refundRows = await db.execute(sql`SELECT id FROM public.refunds WHERE provider_refund_id = ${parsed.entityId} LIMIT 1`);
        const refundId = (refundRows as unknown as Array<{ id: string }>)[0]?.id;
        if (refundId) await applyRefundState(db, refundId, refundStatus);
      }
      await db.update(paymentWebhookEvents).set({ status: "sent", attempts: event.attempts + 1 }).where(eq(paymentWebhookEvents.id, event.id));
      processed += 1;
    } catch (error) {
      await db.update(paymentWebhookEvents).set({ status: "pending", attempts: event.attempts + 1, lastError: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed" }).where(eq(paymentWebhookEvents.id, event.id));
    }
  }
  const refunds = await db.execute(sql`select * from public.claim_pending_refunds(25)`);
  for (const refund of refunds as unknown as Array<{ id: string; request_id: string; amount_minor: number; idempotency_key: string; provider_payment_id: string; attempts: number }>) {
    try {
      const providerRefund = await getPaymentProvider().createRefund({ paymentId: refund.provider_payment_id, amountMinor: refund.amount_minor, receipt: refund.idempotency_key });
      const status = providerRefund.status === "processed" ? "processed" : "pending";
      await db.execute(sql`update public.refunds set status = ${status}::refund_status, provider_refund_id = ${providerRefund.id}, processing_started_at = null, failure_reason = null, processed_at = case when ${status} = 'processed' then now() else processed_at end, updated_at = now() where id = ${refund.id}::uuid`);
      await applyRefundState(db, refund.id, status);
    } catch (error) {
      const statusCode = error instanceof PaymentProviderError ? error.status : undefined;
      const retry = isRetryableRefundError(statusCode);
      const reason = safeRefundFailureReason(statusCode);
      if (retry) {
        await db.execute(sql`update public.refunds set status = 'requested'::refund_status, processing_started_at = null, next_attempt_at = now() + (least(30, power(2, ${refund.attempts})) || ' minutes')::interval, failure_reason = ${reason}, updated_at = now() where id = ${refund.id}::uuid`);
      } else {
        await db.execute(sql`update public.refunds set status = 'failed'::refund_status, processing_started_at = null, failure_reason = ${reason}, updated_at = now() where id = ${refund.id}::uuid`);
        await db.execute(sql`update public.refund_requests set status = 'failed'::refund_status, updated_at = now() where id = ${refund.request_id}::uuid and status <> 'processed'::refund_status`);
      }
    }
  }
  const submittedRefunds = await db.execute(sql`SELECT id, provider_refund_id FROM public.refunds WHERE provider_refund_id IS NOT NULL AND status IN ('requested'::refund_status, 'pending'::refund_status) LIMIT 50`);
  for (const refund of submittedRefunds as unknown as Array<{ id: string; provider_refund_id: string }>) {
    try {
      const providerRefund = await getPaymentProvider().fetchRefund(refund.provider_refund_id);
      await applyRefundState(db, refund.id, normalizeProviderRefundState(providerRefund.status));
    } catch (error) {
      const statusCode = error instanceof PaymentProviderError ? error.status : undefined;
      if (!isRetryableRefundError(statusCode)) await applyRefundState(db, refund.id, "failed", safeRefundFailureReason(statusCode));
    }
  }
  let deliveries: Array<{ id: string; dedupe_key: string; template: string; email: string; title: string; message: string }> = [];
  try {
    deliveries = (await db.execute(sql`select d.id, d.dedupe_key, d.template, u.email, coalesce(n.title, 'Appointment reminder') as title, coalesce(n.message, 'This is a reminder for your upcoming Schedula appointment.') as message from public.notification_deliveries d join auth.users u on u.id = d.recipient_id left join public.notifications n on n.id = d.notification_id left join public.appointments a on a.id = d.appointment_id left join public.appointment_slots s on s.id = a.slot_id where d.channel = 'email' and d.status = 'pending' and d.scheduled_at <= now() and (d.template not like 'appointment_reminder%' or (a.status = 'confirmed' and s.slot_start_at > now())) order by d.scheduled_at limit 50`)) as unknown as Array<{ id: string; dedupe_key: string; template: string; email: string; title: string; message: string }>;
  } catch {
    // A restricted database role may not be able to read auth.users. Leave the outbox pending and continue refunds.
  }
  let delivered = 0;
  for (const delivery of deliveries as unknown as Array<{ id: string; dedupe_key: string; template: string; email: string; title: string; message: string }>) {
    const result = await sendNotificationEmail({ to: delivery.email, subject: delivery.template === "appointment_reminder_24h" ? "Appointment reminder (24 hours)" : delivery.template === "appointment_reminder_2h" ? "Appointment reminder (2 hours)" : delivery.title, text: delivery.message }, delivery.dedupe_key);
    await db.execute(sql`update public.notification_deliveries set status = ${result === "sent" ? "sent" : "failed"}::delivery_status, attempts = attempts + 1, last_error = ${result === "failed" ? "Email provider rejected delivery" : null}, updated_at = now() where id = ${delivery.id}::uuid`);
    if (result === "sent") delivered += 1;
  }
  return NextResponse.json({ expired: Number((expired as unknown as Array<{ count: number }>)[0]?.count ?? 0), processed, delivered });
}
