"use server";

import { createClient } from "@/lib/supabase/server";

const phonePattern = /^\+[1-9]\d{7,14}$/;

export async function updateNotificationPreferencesAction(_: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Your session has expired." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile) return { error: "Your profile could not be found." };

  const operationalEmail = formData.get("operationalEmail") === "on";
  const operationalSms = formData.get("operationalSms") === "on";
  const reminderEmail = formData.get("reminderEmail") === "on";
  const reminderSms = formData.get("reminderSms") === "on";
  const phone = String(formData.get("phone") ?? "").trim();

  if (operationalSms || reminderSms) {
    const storedPhone = profile.role === "doctor"
      ? phone
      : (await supabase.from("patients").select("phone").eq("id", auth.user.id).maybeSingle()).data?.phone;
    if (!storedPhone || !phonePattern.test(storedPhone)) return { error: "Add a valid phone number in international format before enabling SMS." };
  }
  if (profile.role === "doctor" && phone && !phonePattern.test(phone)) return { error: "Use an international phone number such as +919876543210." };

  if (profile.role === "doctor" && phone) {
    const { error } = await supabase.from("doctors").update({ phone }).eq("id", auth.user.id);
    if (error) return { error: "We could not save your phone number." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_preferences").upsert({
    recipient_id: auth.user.id,
    operational_email: operationalEmail,
    operational_sms: operationalSms,
    reminder_email: reminderEmail,
    reminder_sms: reminderSms,
    email_consented_at: operationalEmail || reminderEmail ? now : null,
    sms_consented_at: operationalSms || reminderSms ? now : null,
    email_revoked_at: operationalEmail || reminderEmail ? null : now,
    sms_revoked_at: operationalSms || reminderSms ? null : now,
    updated_at: now,
  });
  if (error) return { error: "We could not save your notification preferences." };
  return { success: true };
}
