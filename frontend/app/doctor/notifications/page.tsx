import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getNotifications } from "@/lib/notifications/queries";
import { NotificationList } from "@/components/notification-list";
import { PortalShell } from "@/components/portal-shell";

export const instant = false;

export default async function DoctorNotificationsPage() {
  await connection();
  const account = await requireRole("doctor");
  const notifications = await getNotifications();
  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-2 text-muted-foreground">Updates on your appointments and schedule.</p>
        </div>
        <NotificationList notifications={notifications} role="doctor" />
      </div>
    </PortalShell>
  );
}
