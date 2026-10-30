import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { sql } from "drizzle-orm";

function validTwilioSignature(url: string, values: Record<string, string>, supplied: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !supplied) return false;
  const data = url + Object.keys(values).sort().map((key) => key + values[key]).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const values = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  if (!validTwilioSignature(`${process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin}/api/webhooks/twilio/status`, values, request.headers.get("x-twilio-signature"))) return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  const providerId = values.MessageSid;
  const status = values.MessageStatus;
  const mapped = status === "delivered" ? "delivered" : ["failed", "undelivered"].includes(status) ? status : null;
  if (providerId && mapped) await createDb().execute(sql`UPDATE public.notification_deliveries SET status = ${mapped}::notification_delivery_status, delivered_at = CASE WHEN ${mapped} = 'delivered' THEN now() ELSE delivered_at END, failed_at = CASE WHEN ${mapped} IN ('failed','undelivered') THEN now() ELSE failed_at END, last_error = ${values.ErrorCode ?? null}, updated_at = now() WHERE provider = 'twilio' AND provider_message_id = ${providerId}`);
  return NextResponse.json({ accepted: true });
}
