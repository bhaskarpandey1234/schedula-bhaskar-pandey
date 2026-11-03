"use client";

import { useActionState } from "react";
import { updateNotificationPreferencesAction } from "@/lib/notifications/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Preferences = {
  operational_email: boolean;
  operational_sms: boolean;
  reminder_email: boolean;
  reminder_sms: boolean;
  phone?: string | null;
};

export function NotificationPreferencesForm({ role, preferences }: { role: "patient" | "doctor"; preferences: Preferences }) {
  const [state, action, pending] = useActionState(updateNotificationPreferencesAction, {} as { error?: string; success?: boolean });
  return <Card>
    <CardHeader><CardTitle>Communication preferences</CardTitle><CardDescription>Operational appointment updates only. Schedula does not send promotional messages from these settings.</CardDescription></CardHeader>
    <CardContent>
      <form action={action} className="grid gap-4">
        {role === "doctor" && <div className="grid gap-2"><Label htmlFor="notification-phone">SMS phone number</Label><Input id="notification-phone" name="phone" defaultValue={preferences.phone ?? ""} placeholder="+919876543210" inputMode="tel" /><p className="text-xs text-muted-foreground">Use international E.164 format. SMS consent is recorded when enabled.</p></div>}
        <fieldset className="grid gap-3"><legend className="text-sm font-semibold">Appointment updates</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="operationalEmail" defaultChecked={preferences.operational_email} /> Email updates</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="operationalSms" defaultChecked={preferences.operational_sms} /> SMS updates</label></fieldset>
        <fieldset className="grid gap-3"><legend className="text-sm font-semibold">Upcoming reminders</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminderEmail" defaultChecked={preferences.reminder_email} /> Email reminders</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminderSms" defaultChecked={preferences.reminder_sms} /> SMS reminders</label></fieldset>
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="text-sm text-success">Preferences saved.</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>
      </form>
    </CardContent>
  </Card>;
}
