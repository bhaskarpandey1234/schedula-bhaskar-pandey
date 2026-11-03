import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { sql } from "drizzle-orm";

function validSignature(raw: string, headers: Headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return signatures.split(" ").some((candidate) => {
    const supplied = candidate.replace(/^v1,/, "");
    const left = Buffer.from(expected); const right = Buffer.from(supplied);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers)) return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  const payload = JSON.parse(raw) as { type?: string; data?: { email_id?: string; id?: string } };
  const providerId = payload.data?.email_id ?? payload.data?.id;
  if (!providerId) return NextResponse.json({ accepted: true });
  const status = payload.type?.includes("delivered") ? "delivered" : payload.type?.includes("bounced") || payload.type?.includes("complained") ? "undeliverable" : payload.type?.includes("failed") ? "failed" : null;
  if (status) await createDb().execute(sql`UPDATE public.notification_deliveries SET status = ${status}::notification_delivery_status, delivered_at = CASE WHEN ${status} = 'delivered' THEN now() ELSE delivered_at END, failed_at = CASE WHEN ${status} IN ('failed','undeliverable') THEN now() ELSE failed_at END, updated_at = now() WHERE provider = 'resend' AND provider_message_id = ${providerId}`);
  return NextResponse.json({ accepted: true });
}
