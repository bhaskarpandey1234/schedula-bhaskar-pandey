"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/lib/auth/guards";

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
