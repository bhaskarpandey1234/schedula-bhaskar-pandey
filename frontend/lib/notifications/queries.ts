import { desc, eq, isNull, and } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
  appointmentId: string;
};

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getNotifications(): Promise<NotificationRow[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const db = createDb();
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      appointmentId: notifications.appointmentId,
    })
    .from(notifications)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  const db = createDb();
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  return rows.length;
}
