import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/db";

function statusForEvent(event: string | undefined) {
  switch (event) {
    case "request":
    case "sent": return "sent";
    case "delivered": return "delivered";
    case "deferred": return "pending";
    case "hardBounce":
    case "softBounce":
    case "blocked":
    case "invalid":
    case "spam":
    case "unsubscribed": return "undeliverable";
    default: return null;
  }
}

export async function POST(request: Request) {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-brevo-webhook-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !supplied || supplied !== secret) return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  let payload: { event?: string; "message-id"?: string; messageId?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const providerId = payload["message-id"] ?? payload.messageId;
  const status = statusForEvent(payload.event);
  if (providerId && status) {
    await createDb().execute(sql`UPDATE public.notification_deliveries SET status = ${status}::notification_delivery_status, delivered_at = CASE WHEN ${status} = 'delivered' THEN now() ELSE delivered_at END, failed_at = CASE WHEN ${status} = 'undeliverable' THEN now() ELSE failed_at END, next_attempt_at = CASE WHEN ${status} = 'pending' THEN now() + interval '5 minutes' ELSE next_attempt_at END, updated_at = now() WHERE provider = 'brevo' AND provider_message_id = ${providerId}`);
  }
  return NextResponse.json({ accepted: true });
}
