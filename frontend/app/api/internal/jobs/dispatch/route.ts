import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { paymentWebhookEvents } from "@/lib/db/schema";
import { sendEmail, sendSms, sendWhatsApp } from "@/lib/notifications/providers";
import { renderNotificationTemplate } from "@/lib/notifications/templates";
import { getPaymentProvider } from "@/lib/payments/provider";
import { PaymentProviderError } from "@/lib/payments/provider";
import { findMatchingProviderRefund, isRetryableRefundError, normalizeProviderRefundState, safeRefundFailureReason } from "@/lib/payments/refund-state";
import { findMatchingCapturedPayment } from "@/lib/payments/reconciliation";

const DELIVERY_RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 21600] as const;

function deliveryRetryDelaySeconds(attempts: number) {
  return DELIVERY_RETRY_DELAYS_SECONDS[Math.min(Math.max(attempts - 1, 0), DELIVERY_RETRY_DELAYS_SECONDS.length - 1)];
}

async function finalizeDeliveryFailure(
  db: ReturnType<typeof createDb>,
  delivery: { id: string; attempts: number },
  provider: string,
  errorCode: string,
  retryable: boolean,
) {
  const retry = retryable && delivery.attempts < 5;
  await db.execute(sql`
    UPDATE public.notification_deliveries
    SET status = ${retry ? "pending" : "failed"}::notification_delivery_status,
        provider = ${provider},
        processing_started_at = NULL,
        next_attempt_at = CASE WHEN ${retry} THEN now() + ${deliveryRetryDelaySeconds(delivery.attempts)} * interval '1 second' ELSE NULL END,
        failed_at = CASE WHEN ${retry} THEN NULL ELSE now() END,
        last_error = ${errorCode},
        updated_at = now()
    WHERE id = ${delivery.id}::uuid
  `);
}

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
  await db.execute(sql`select public.expire_elastic_booking_proposals() as count`);
  const events = await db.select().from(paymentWebhookEvents).where(inArray(paymentWebhookEvents.status, ["pending", "failed"])).limit(50);
  let processed = 0;
  let reconciled = 0;
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
  const pendingPayments = await db.execute(sql`
    SELECT p.id, p.provider_order_id, p.amount_minor, p.currency
    FROM public.payments p
    JOIN public.slot_reservations r ON r.id = p.reservation_id
    WHERE p.provider = 'razorpay'
      AND p.status IN ('creating'::payment_status, 'pending'::payment_status)
      AND p.provider_order_id IS NOT NULL
      AND r.status IN ('active'::reservation_status, 'expired'::reservation_status)
    ORDER BY p.created_at
    LIMIT 50
  `);
  const reconciliationProvider = getPaymentProvider();
  for (const payment of pendingPayments as unknown as Array<{ id: string; provider_order_id: string; amount_minor: number; currency: string }>) {
    try {
      const candidates = await reconciliationProvider.listOrderPayments(payment.provider_order_id);
      const captured = findMatchingCapturedPayment(candidates, { orderId: payment.provider_order_id, amountMinor: payment.amount_minor, currency: payment.currency });
      if (!captured) continue;
      await db.execute(sql`select public.complete_payment(${payment.id}::uuid, ${captured.id}, 'captured')`);
      reconciled += 1;
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) console.error("[payments] reconciliation failed", { code: "reconciliation_error" });
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
      SELECT a.patient_id, a.id, 'whatsapp'::notification_channel, ${template}, GREATEST(s.slot_start_at - (${minutes} || ' minutes')::interval, now()), 'reminder/' || a.id::text || '/' || ${minutes} || '/whatsapp'
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.notification_preferences pref ON pref.recipient_id = a.patient_id AND pref.reminder_whatsapp
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
      SELECT a.doctor_id, a.id, 'whatsapp'::notification_channel, ${template}, GREATEST(s.slot_start_at - (${minutes} || ' minutes')::interval, now()), 'reminder/' || a.id::text || '/' || ${minutes} || '/doctor-whatsapp'
      FROM public.appointments a JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.notification_preferences pref ON pref.recipient_id = a.doctor_id AND pref.reminder_whatsapp
      JOIN public.doctors doctor ON doctor.id = a.doctor_id AND doctor.phone IS NOT NULL
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
    let details: Array<{ recipient_id: string; patient_id: string; doctor_id: string; email: string | null; phone: string | null; recipient_name: string; recipient_role: string; patient_name: string; doctor_name: string; clinic_name: string; timezone: string; slot_start_at: string; slot_end_at: string; scheduling_type: "wave" | "stream"; notification_metadata: { old_start_at?: string; old_end_at?: string; recommended_start_at?: string; recommended_end_at?: string; decision_deadline?: string } | null }> = [];
    try {
      details = (await db.execute(sql`
        SELECT * FROM public.notification_delivery_context(${delivery.id}::uuid)
      `)) as unknown as Array<{ recipient_id: string; patient_id: string; doctor_id: string; email: string | null; phone: string | null; recipient_name: string; recipient_role: string; patient_name: string; doctor_name: string; clinic_name: string; timezone: string; slot_start_at: string; slot_end_at: string; scheduling_type: "wave" | "stream"; notification_metadata: { old_start_at?: string; old_end_at?: string; recommended_start_at?: string; recommended_end_at?: string; decision_deadline?: string } | null }>;
    } catch {
      await db.execute(sql`SELECT public.record_notification_attempt(${delivery.id}::uuid, ${delivery.attempts}, 'internal', 'failed', NULL, 'delivery_context_lookup_failed')`);
      await finalizeDeliveryFailure(db, delivery, "internal", "delivery_context_lookup_failed", true);
      console.error("[notifications] delivery_context_lookup_failed");
      continue;
    }
    const row = details[0];
    if (!row) {
      await db.execute(sql`UPDATE public.notification_deliveries SET status = 'failed'::notification_delivery_status, failed_at = now(), last_error = 'appointment_context_missing', updated_at = now() WHERE id = ${delivery.id}::uuid`);
      continue;
    }
    try {
      const recipientRole = row.recipient_role === "doctor" || row.recipient_role === "patient" ? row.recipient_role : null;
      const expectedRecipientId = recipientRole === "doctor" ? row.doctor_id : recipientRole === "patient" ? row.patient_id : null;
      if (!recipientRole || !expectedRecipientId || row.recipient_id !== delivery.recipient_id || expectedRecipientId !== delivery.recipient_id) {
        await db.execute(sql`SELECT public.record_notification_attempt(${delivery.id}::uuid, ${delivery.attempts}, 'internal', 'failed', NULL, 'recipient_mismatch')`);
        await finalizeDeliveryFailure(db, delivery, "internal", "recipient_mismatch", false);
        continue;
      }
      const content = renderNotificationTemplate({ template: delivery.template, recipientName: row.recipient_name, recipientRole, patientName: row.patient_name, doctorName: row.doctor_name, clinicName: row.clinic_name, timezone: row.timezone, slotStartAt: row.slot_start_at, slotEndAt: row.slot_end_at, schedulingType: row.scheduling_type, previousSlotStartAt: row.notification_metadata?.old_start_at, previousSlotEndAt: row.notification_metadata?.old_end_at, recommendedSlotStartAt: row.notification_metadata?.recommended_start_at, recommendedSlotEndAt: row.notification_metadata?.recommended_end_at, decisionDeadline: row.notification_metadata?.decision_deadline }, delivery.channel === "sms" ? "sms" : delivery.channel === "whatsapp" ? "whatsapp" : "email");
      const result = delivery.channel === "sms"
        ? (row.phone ? await sendSms({ to: row.phone, text: content.text, idempotencyKey: delivery.id }) : { status: "skipped" as const, provider: process.env.SMS_PROVIDER?.trim().toLowerCase() === "vonage" ? "vonage" : "twilio", errorCode: "phone_missing" })
        : delivery.channel === "whatsapp"
          ? (row.phone ? await sendWhatsApp({ to: row.phone, text: content.text, idempotencyKey: delivery.id }) : { status: "skipped" as const, provider: "whatsapp", errorCode: "phone_missing" })
        : (row.email ? await sendEmail({ to: row.email, subject: content.subject, text: content.text, idempotencyKey: delivery.id }) : { status: "skipped" as const, provider: process.env.BREVO_API_KEY ? "brevo" : "resend", errorCode: "email_missing" });
      await db.execute(sql`SELECT public.record_notification_attempt(${delivery.id}::uuid, ${delivery.attempts}, ${result.provider}, ${result.status}, ${result.providerMessageId ?? null}, ${result.errorCode ?? null})`);
      if (result.status === "sent") {
        await db.execute(sql`UPDATE public.notification_deliveries SET status = 'sent'::notification_delivery_status, provider = ${result.provider}, provider_message_id = ${result.providerMessageId ?? null}, sent_at = now(), processing_started_at = null, last_error = null, updated_at = now() WHERE id = ${delivery.id}::uuid`);
        delivered += 1;
      } else {
        await finalizeDeliveryFailure(db, delivery, result.provider, result.errorCode ?? "delivery_failed", result.status === "failed" && result.retryable !== false);
      }
    } catch {
      await db.execute(sql`SELECT public.record_notification_attempt(${delivery.id}::uuid, ${delivery.attempts}, 'internal', 'failed', NULL, 'delivery_processing_failed')`);
      await finalizeDeliveryFailure(db, delivery, "internal", "delivery_processing_failed", true);
      console.error("[notifications] delivery_processing_failed");
    }
  }
  return NextResponse.json({ expired: Number((expired as unknown as Array<{ count: number }>)[0]?.count ?? 0), processed, reconciled, delivered, claimed: claimed.length });
}
