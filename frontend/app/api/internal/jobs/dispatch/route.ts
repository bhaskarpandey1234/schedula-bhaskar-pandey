import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { paymentWebhookEvents } from "@/lib/db/schema";
import { sendNotificationEmail } from "@/lib/email";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: Request) {
  const expected = process.env.JOB_RUNNER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-job-secret");
  if (!expected || supplied !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createDb();
  const expired = await db.execute(sql`select public.expire_payment_holds() as count`);
  const events = await db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.status, "pending")).limit(50);
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
        await db.execute(sql`update public.refunds set status = ${refundStatus}::refund_status, processed_at = case when ${refundStatus} = 'processed' then now() else processed_at end, updated_at = now() where provider_refund_id = ${parsed.entityId}`);
      }
      await db.update(paymentWebhookEvents).set({ status: "sent", attempts: event.attempts + 1 }).where(eq(paymentWebhookEvents.id, event.id));
      processed += 1;
    } catch (error) {
      await db.update(paymentWebhookEvents).set({ status: "failed", attempts: event.attempts + 1, lastError: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed" }).where(eq(paymentWebhookEvents.id, event.id));
    }
  }
  const refunds = await db.execute(sql`select r.id, r.request_id, r.amount_minor, r.idempotency_key, p.provider_payment_id from public.refunds r join public.payments p on p.id = r.payment_id where r.status = 'requested' and p.provider_payment_id is not null limit 25`);
  for (const refund of refunds as unknown as Array<{ id: string; request_id: string; amount_minor: number; idempotency_key: string; provider_payment_id: string }>) {
    try {
      const providerRefund = await getPaymentProvider().createRefund({ paymentId: refund.provider_payment_id, amountMinor: refund.amount_minor, receipt: refund.idempotency_key });
      const status = providerRefund.status === "processed" ? "processed" : "pending";
      await db.execute(sql`update public.refunds set status = ${status}::refund_status, provider_refund_id = ${providerRefund.id}, processed_at = case when ${status} = 'processed' then now() else processed_at end, updated_at = now() where id = ${refund.id}::uuid`);
      await db.execute(sql`update public.refund_requests set status = ${status}::refund_status, updated_at = now() where id = ${refund.request_id}::uuid`);
    } catch (error) {
      await db.execute(sql`update public.refunds set status = 'failed'::refund_status, failure_reason = ${error instanceof Error ? error.message.slice(0, 500) : "Refund provider failed"}, updated_at = now() where id = ${refund.id}::uuid`);
      await db.execute(sql`update public.refund_requests set status = 'failed'::refund_status, updated_at = now() where id = ${refund.request_id}::uuid`);
    }
  }
  const deliveries = await db.execute(sql`select d.id, d.dedupe_key, d.template, u.email, coalesce(n.title, 'Appointment reminder') as title, coalesce(n.message, 'This is a reminder for your upcoming Schedula appointment.') as message from public.notification_deliveries d join auth.users u on u.id = d.recipient_id left join public.notifications n on n.id = d.notification_id left join public.appointments a on a.id = d.appointment_id left join public.appointment_slots s on s.id = a.slot_id where d.channel = 'email' and d.status = 'pending' and d.scheduled_at <= now() and (d.template not like 'appointment_reminder%' or (a.status = 'confirmed' and s.slot_start_at > now())) order by d.scheduled_at limit 50`);
  let delivered = 0;
  for (const delivery of deliveries as unknown as Array<{ id: string; dedupe_key: string; template: string; email: string; title: string; message: string }>) {
    const result = await sendNotificationEmail({ to: delivery.email, subject: delivery.template === "appointment_reminder_24h" ? "Appointment reminder (24 hours)" : delivery.template === "appointment_reminder_2h" ? "Appointment reminder (2 hours)" : delivery.title, text: delivery.message }, delivery.dedupe_key);
    await db.execute(sql`update public.notification_deliveries set status = ${result === "sent" ? "sent" : "failed"}::delivery_status, attempts = attempts + 1, last_error = ${result === "failed" ? "Email provider rejected delivery" : null}, updated_at = now() where id = ${delivery.id}::uuid`);
    if (result === "sent") delivered += 1;
  }
  return NextResponse.json({ expired: Number((expired as unknown as Array<{ count: number }>)[0]?.count ?? 0), processed, delivered });
}
