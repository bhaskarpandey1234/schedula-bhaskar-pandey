import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getNotifications } from "@/lib/notifications/queries";
import { NotificationList } from "@/components/notification-list";
import { PortalShell } from "@/components/portal-shell";

export const instant = false;

export default async function PatientNotificationsPage() {
  await connection();
  const account = await requireRole("patient");
  const notifications = await getNotifications();
  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-2 text-muted-foreground">Updates on your appointments and payments.</p>
        </div>
        <NotificationList notifications={notifications} role="patient" />
      </div>
    </PortalShell>
  );
}
