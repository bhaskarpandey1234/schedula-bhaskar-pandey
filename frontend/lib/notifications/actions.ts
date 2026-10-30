"use server";

import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/lib/auth/guards";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function markAllNotificationsRead(role: "patient" | "doctor") {
  try { await requireVerifiedUser(); } catch { return; }
  const userId = await currentUserId();
  if (!userId) return;
  const db = createDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  revalidatePath(`/${role}/notifications`);
}

export async function markNotificationRead(id: string, role: "patient" | "doctor") {
  try { await requireVerifiedUser(); } catch { return; }
  const userId = await currentUserId();
  if (!userId) return;
  const db = createDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  revalidatePath(`/${role}/notifications`);
}
