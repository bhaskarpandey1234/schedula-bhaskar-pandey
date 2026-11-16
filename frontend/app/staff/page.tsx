import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getQueueBoard } from "@/lib/queue/queries";
import { QueueBoard } from "@/components/queue/queue-board";

export const instant = false;

export default async function StaffPage() {
  await connection();
  const account = await requireRole("staff");
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff_clinic_memberships")
    .select("clinic_id").eq("staff_id", account.user.id).maybeSingle();
  if (error) throw new Error("Clinic assignment could not be loaded.");
  if (!data) return <div className="rounded-xl border p-6"><h1 className="text-xl font-semibold">Clinic assignment pending</h1><p className="mt-2 text-sm text-muted-foreground">Ask an administrator to assign your account to a clinic before checking in patients.</p></div>;
  return <QueueBoard role="staff" rows={await getQueueBoard(data.clinic_id)} />;
}
