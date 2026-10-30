import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getNotifications } from "@/lib/notifications/queries";
import { NotificationList } from "@/components/notification-list";
import { PortalShell } from "@/components/portal-shell";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function PatientNotificationsPage() {
  await connection();
  const account = await requireRole("patient");
  const notifications = await getNotifications();
  const supabase = await createClient();
  const { data: preferences } = await supabase.from("notification_preferences").select("operational_email, operational_sms, reminder_email, reminder_sms").eq("recipient_id", account.user.id).maybeSingle();
  const { data: patient } = await supabase.from("patients").select("phone").eq("id", account.user.id).maybeSingle();
  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-2 text-muted-foreground">Updates on your appointments and payments.</p>
        </div>
        <NotificationList notifications={notifications} role="patient" />
        <NotificationPreferencesForm role="patient" preferences={{ ...(preferences ?? { operational_email: false, operational_sms: false, reminder_email: false, reminder_sms: false }), phone: patient?.phone }} />
      </div>
    </PortalShell>
  );
}
