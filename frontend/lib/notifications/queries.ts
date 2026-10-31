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

export type NotificationFeedResult = {
  notifications: NotificationRow[];
  loadFailed: boolean;
};

type NotificationDatabaseRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  appointment_id: string;
};

export function mapNotificationRows(rows: NotificationDatabaseRow[]): NotificationRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at ? new Date(row.read_at) : null,
    createdAt: new Date(row.created_at),
    appointmentId: row.appointment_id,
  }));
}

export async function getNotifications(): Promise<NotificationFeedResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, read_at, created_at, appointment_id")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[notifications] feed_query_failed", { code: error.code });
    return { notifications: [], loadFailed: true };
  }

  return {
    notifications: mapNotificationRows((data ?? []) as NotificationDatabaseRow[]),
    loadFailed: false,
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("[notifications] unread_count_query_failed", { code: error.code });
    return 0;
  }

  return count ?? 0;
}
