import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getQueueBoard, getQueueDoctors, parseQueueServiceDate } from "@/lib/queue/queries";
import { QueueBoard } from "@/components/queue/queue-board";

export const instant = false;

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; doctorId?: string; slotId?: string }>;
}) {
  await connection();
  const account = await requireRole("staff");
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff_clinic_memberships")
    .select("clinic_id").eq("staff_id", account.user.id).maybeSingle();
  if (error) throw new Error("Clinic assignment could not be loaded.");
  if (!data) return <div className="rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Clinic assignment pending</h1><p className="mt-2 text-sm text-muted-foreground">Ask an administrator to assign your account to a clinic before managing the queue.</p></div>;
  const doctors = await getQueueDoctors(data.clinic_id);
  const params = await searchParams;
  const requestedDoctor = doctors.find((doctor) => doctor.doctor_id === params?.doctorId)?.doctor_id;
  const doctorFilter = requestedDoctor ?? "";
  const timezone = doctors.find((doctor) => doctor.doctor_id === requestedDoctor)?.timezone ?? doctors[0]?.timezone ?? "UTC";
  const serviceDate = parseQueueServiceDate(params?.date, timezone);
  const rows = doctorFilter ? await getQueueBoard(data.clinic_id, requestedDoctor, serviceDate) : [];
  const slotId = rows.some((row) => row.slot_id === params?.slotId) ? params?.slotId ?? "" : "";
  return <QueueBoard rows={rows} doctors={doctors} serviceDate={serviceDate} doctorId={doctorFilter} slotId={slotId} />;
}
