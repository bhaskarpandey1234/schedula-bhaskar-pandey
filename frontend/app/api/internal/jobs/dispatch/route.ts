import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { paymentWebhookEvents } from "@/lib/db/schema";
import { sendEmail, sendSms } from "@/lib/notifications/providers";
import { renderNotificationTemplate } from "@/lib/notifications/templates";
import { notificationAttempts } from "@/lib/db/schema";
import { getPaymentProvider } from "@/lib/payments/provider";
import { PaymentProviderError } from "@/lib/payments/provider";
import { findMatchingProviderRefund, isRetryableRefundError, normalizeProviderRefundState, safeRefundFailureReason } from "@/lib/payments/refund-state";

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
  const submittedRefunds = await db.execute(sql`
    SELECT r.id, r.amount_minor, r.provider_refund_id, p.provider_payment_id
    FROM public.refunds r
    JOIN public.payments p ON p.id = r.payment_id
    WHERE r.status IN ('requested'::refund_status, 'pending'::refund_status)
      AND p.provider_payment_id IS NOT NULL
    ORDER BY r.created_at
    LIMIT 50
  `);
  for (const refund of submittedRefunds as unknown as Array<{ id: string; amount_minor: number; provider_refund_id: string | null; provider_payment_id: string }>) {
    try {
      const provider = getPaymentProvider();
      let providerRefund = refund.provider_refund_id ? await provider.fetchRefund(refund.provider_refund_id) : undefined;
      if (!providerRefund) {
        const linkedRows = await db.execute(sql`SELECT provider_refund_id FROM public.refunds WHERE payment_id = (SELECT payment_id FROM public.refunds WHERE id = ${refund.id}::uuid) AND provider_refund_id IS NOT NULL`);
        const linkedIds = new Set((linkedRows as unknown as Array<{ provider_refund_id: string }>).map((row) => row.provider_refund_id));
        const candidates = await provider.listPaymentRefunds(refund.provider_payment_id);
        const match = findMatchingProviderRefund(candidates, refund.provider_payment_id, refund.amount_minor, linkedIds);
        if (!match) continue;
        providerRefund = match;
        await db.execute(sql`UPDATE public.refunds SET provider_refund_id = ${match.id}, updated_at = now() WHERE id = ${refund.id}::uuid AND provider_refund_id IS NULL`);
      }
      const currentRefund = providerRefund;
      if (!currentRefund) continue;
      await applyRefundState(db, refund.id, normalizeProviderRefundState(currentRefund.status));
    } catch (error) {
      const statusCode = error instanceof PaymentProviderError ? error.status : undefined;
      if (!isRetryableRefundError(statusCode)) await applyRefundState(db, refund.id, "failed", safeRefundFailureReason(statusCode));
    }
  }
  const configuredIntervals = (process.env.APPOINTMENT_REMINDER_INTERVALS_MINUTES ?? "1440,120").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0 && value <= 60 * 24 * 30);
  for (const minutes of [...new Set(configuredIntervals)]) {
    const template = `appointment_reminder_${minutes}m`;
    await db.execute(sql`
      INSERT INTO public.notification_deliveries(recipient_id, appointment_id, channel, template, scheduled_at, dedupe_key)
      SELECT a.patient_id, a.id, 'email'::notification_channel, ${template}, GREATEST(s.slot_start_at - (${minutes} || ' minutes')::interval, now()), 'reminder/' || a.id::text || '/' || ${minutes} || '/email'
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.notification_preferences pref ON pref.recipient_id = a.patient_id AND pref.reminder_email
      WHERE a.status = 'confirmed' AND s.slot_start_at > now()
      ON CONFLICT (dedupe_key) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO public.notification_deliveries(recipient_id, appointment_id, channel, template, scheduled_at, dedupe_key)
      SELECT a.patient_id, a.id, 'sms'::notification_channel, ${template}, GREATEST(s.slot_start_at - (${minutes} || ' minutes')::interval, now()), 'reminder/' || a.id::text || '/' || ${minutes} || '/sms'
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.notification_preferences pref ON pref.recipient_id = a.patient_id AND pref.reminder_sms
      JOIN public.patients patient ON patient.id = a.patient_id
      WHERE a.status = 'confirmed' AND s.slot_start_at > now() AND patient.phone IS NOT NULL
      ON CONFLICT (dedupe_key) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO public.notification_deliveries(recipient_id, appointment_id, channel, template, scheduled_at, dedupe_key)
      SELECT a.doctor_id, a.id, 'email'::notification_channel, ${template}, GREATEST(s.slot_start_at - (${minutes} || ' minutes')::interval, now()), 'reminder/' || a.id::text || '/' || ${minutes} || '/doctor-email'
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.notification_preferences pref ON pref.recipient_id = a.doctor_id AND pref.reminder_email
      WHERE a.status = 'confirmed' AND s.slot_start_at > now()
      ON CONFLICT (dedupe_key) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO public.notification_deliveries(recipient_id, appointment_id, channel, template, scheduled_at, dedupe_key)
      SELECT a.doctor_id, a.id, 'sms'::notification_channel, ${template}, GREATEST(s.slot_start_at - (${minutes} || ' minutes')::interval, now()), 'reminder/' || a.id::text || '/' || ${minutes} || '/doctor-sms'
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.notification_preferences pref ON pref.recipient_id = a.doctor_id AND pref.reminder_sms
      JOIN public.doctors doctor ON doctor.id = a.doctor_id AND doctor.phone IS NOT NULL
      WHERE a.status = 'confirmed' AND s.slot_start_at > now()
      ON CONFLICT (dedupe_key) DO NOTHING`);
  }
  await db.execute(sql`UPDATE public.notification_deliveries d SET status = 'cancelled'::notification_delivery_status, updated_at = now() WHERE d.template LIKE 'appointment_reminder%' AND d.status IN ('pending'::notification_delivery_status, 'processing'::notification_delivery_status) AND NOT EXISTS (SELECT 1 FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id WHERE a.id = d.appointment_id AND a.status = 'confirmed' AND s.slot_start_at > now())`);
  const claimed = (await db.execute(sql`select * from public.claim_notification_deliveries(50)`)) as unknown as Array<{ id: string; recipient_id: string; appointment_id: string; channel: string; template: string; dedupe_key: string; attempts: number }>;
  let delivered = 0;
  for (const delivery of claimed) {
    let details: Array<{ email: string | null; phone: string | null; recipient_name: string; doctor_name: string; clinic_name: string; timezone: string; slot_start_at: string; slot_end_at: string }> = [];
    try {
      details = (await db.execute(sql`
      SELECT u.email, COALESCE(patient.phone, doctor.phone) AS phone, COALESCE(recipient_profile.full_name, 'Schedula user') AS recipient_name,
             doctor_profile.full_name AS doctor_name, doctor.clinic_name, doctor.timezone, s.slot_start_at, s.slot_end_at
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.doctors doctor ON doctor.id = a.doctor_id
      JOIN public.profiles doctor_profile ON doctor_profile.id = doctor.id
      JOIN public.profiles recipient_profile ON recipient_profile.id = ${delivery.recipient_id}::uuid
      LEFT JOIN public.patients patient ON patient.id = ${delivery.recipient_id}::uuid
      LEFT JOIN auth.users u ON u.id = ${delivery.recipient_id}::uuid
      WHERE a.id = ${delivery.appointment_id}::uuid
    `)) as unknown as Array<{ email: string | null; phone: string | null; recipient_name: string; doctor_name: string; clinic_name: string; timezone: string; slot_start_at: string; slot_end_at: string }>;
    } catch {
      continue;
    }
    const row = details[0];
    if (!row) {
      await db.execute(sql`UPDATE public.notification_deliveries SET status = 'failed'::notification_delivery_status, failed_at = now(), last_error = 'appointment_context_missing', updated_at = now() WHERE id = ${delivery.id}::uuid`);
      continue;
    }
    const content = renderNotificationTemplate({ template: delivery.template, recipientName: row.recipient_name, doctorName: row.doctor_name, clinicName: row.clinic_name, timezone: row.timezone, slotStartAt: row.slot_start_at, slotEndAt: row.slot_end_at }, delivery.channel === "sms" ? "sms" : "email");
    const result = delivery.channel === "sms"
      ? (row.phone ? await sendSms({ to: row.phone, text: content.text, idempotencyKey: delivery.dedupe_key }) : { status: "skipped" as const, provider: "twilio", errorCode: "phone_missing" })
      : (row.email ? await sendEmail({ to: row.email, subject: content.subject, text: content.text, idempotencyKey: delivery.dedupe_key }) : { status: "skipped" as const, provider: "resend", errorCode: "email_missing" });
    await db.insert(notificationAttempts).values({ deliveryId: delivery.id, attemptNumber: delivery.attempts, provider: result.provider, outcome: result.status, providerMessageId: result.providerMessageId ?? null, errorCode: result.errorCode ?? null }).onConflictDoNothing();
    if (result.status === "sent") {
      await db.execute(sql`UPDATE public.notification_deliveries SET status = 'sent'::notification_delivery_status, provider = ${result.provider}, provider_message_id = ${result.providerMessageId ?? null}, sent_at = now(), processing_started_at = null, last_error = null, updated_at = now() WHERE id = ${delivery.id}::uuid`);
      delivered += 1;
    } else {
      const retry = result.status === "failed" && delivery.attempts < 5;
      await db.execute(sql`UPDATE public.notification_deliveries SET status = ${retry ? "pending" : "failed"}::notification_delivery_status, provider = ${result.provider}, processing_started_at = null, next_attempt_at = ${retry ? new Date(Date.now() + [60, 300, 900, 3600, 21600][Math.min(delivery.attempts - 1, 4)] * 1000) : null}, failed_at = ${retry ? null : new Date()}, last_error = ${result.errorCode ?? "delivery_failed"}, updated_at = now() WHERE id = ${delivery.id}::uuid`);
    }
  }
  return NextResponse.json({ expired: Number((expired as unknown as Array<{ count: number }>)[0]?.count ?? 0), processed, delivered, claimed: claimed.length });
}
