"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { notificationDestination } from "@/lib/notifications/destinations";

function notificationPath(role: "patient" | "doctor") {
  return `/${role}/notifications`;
}

export async function markAllNotificationsRead() {
  const account = await requireVerifiedUser();
  if (!account.profile) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) {
    console.error("[notifications] mark_all_read_failed", { code: error.code });
    throw new Error("NOTIFICATION_UPDATE_FAILED");
  }
  revalidatePath(notificationPath(account.profile.role));
}

export async function markNotificationRead(id: string) {
  const account = await requireVerifiedUser();
  if (!account.profile) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: id });
  if (error) {
    console.error("[notifications] mark_read_failed", { code: error.code });
    throw new Error("NOTIFICATION_UPDATE_FAILED");
  }
  revalidatePath(notificationPath(account.profile.role));
}

export async function openNotificationAction(id: string) {
  const account = await requireVerifiedUser();
  if (!account.profile) redirect("/auth/login");
  const role = account.profile.role;
  const supabase = await createClient();
  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("type, appointment_id")
    .eq("id", id)
    .maybeSingle();

  if (notificationError || !notification) {
    console.error("[notifications] open_query_failed", { code: notificationError?.code ?? "NOT_FOUND" });
    redirect(notificationPath(role));
  }

  const destination = notificationDestination(role, notification.type, notification.appointment_id);
  const { error: markError } = await supabase.rpc("mark_notification_read", { p_notification_id: id });
  if (markError) console.error("[notifications] open_mark_failed", { code: markError.code });
  revalidatePath(notificationPath(role));
  redirect(destination);
}
