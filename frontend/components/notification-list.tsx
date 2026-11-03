"use client";

import { ArrowUpRight, Bell, BellOff } from "lucide-react";
import { useTransition } from "react";
import type { NotificationRow } from "@/lib/notifications/queries";
import { markAllNotificationsRead, markNotificationRead, openNotificationAction } from "@/lib/notifications/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const typeLabels: Record<string, string> = {
  appointment_booked: "Booking",
  appointment_cancelled: "Cancellation",
  appointment_rescheduled: "Reschedule",
  payment_confirmed: "Payment",
  payment_failed: "Payment failed",
  refund_pending: "Refund",
  refund_processed: "Refund processed",
  refund_failed: "Refund failed",
  appointment_reminder: "Reminder",
};

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationList({
  notifications,
  loadFailed = false,
}: {
  notifications: NotificationRow[];
  loadFailed?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  if (loadFailed) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
        Notifications could not be loaded. Refresh the page or try again shortly.
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <BellOff className="size-8" />
        <p className="text-sm">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => markAllNotificationsRead())}
          >
            Mark all as read
          </Button>
        </div>
      )}
      <div className="grid gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 transition-colors",
              !n.readAt && "border-primary/30 bg-primary/5"
            )}
          >
            <Bell className={cn("mt-0.5 size-4 shrink-0", !n.readAt ? "text-primary" : "text-muted-foreground")} />
            <form action={openNotificationAction.bind(null, n.id)} className="min-w-0 flex-1">
              <button type="submit" className="group w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label={`View details: ${n.title}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {typeLabels[n.type] ?? n.type}
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-1 font-medium group-hover:underline">{n.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  View details <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </span>
              </button>
            </form>
            {!n.readAt && (
              <button
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() => startTransition(() => markNotificationRead(n.id))}
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
