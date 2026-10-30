import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { paymentWebhookEvents } from "@/lib/db/schema";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const eventId = request.headers.get("x-razorpay-event-id") ?? "";
  const provider = getPaymentProvider();
  if (!eventId || !provider.verifyWebhookSignature(rawBody, signature)) return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  let payload: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; refund?: { entity?: { id?: string; payment_id?: string } } } };
  try { payload = JSON.parse(rawBody) as typeof payload; } catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  const entity = (payload.payload?.payment?.entity ?? payload.payload?.refund?.entity ?? {}) as { id?: string; payment_id?: string; order_id?: string };
  const entityId = entity.id ?? entity.payment_id ?? null;
  try {
    const db = createDb();
    await db.insert(paymentWebhookEvents).values({ provider: "razorpay", providerEventId: eventId, eventType: payload.event ?? "unknown", entityId, payload: JSON.stringify({ event: payload.event, entityId, orderId: entity.order_id }) }).onConflictDoNothing();
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: "Webhook could not be stored" }, { status: 503 });
  }
}
