import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getQueueBoard, getQueueDoctors, parseQueueServiceDate } from "@/lib/queue/queries";
import { QueueBoard } from "@/components/queue/queue-board";

export const instant = false;

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; doctorId?: string; slotId?: string }>;
}) {
  await connection();
  await requireRole("admin");
  const doctors = await getQueueDoctors();
  const params = await searchParams;
  const requestedDoctor = doctors.find((doctor) => doctor.doctor_id === params?.doctorId)?.doctor_id;
  const allDoctorsSelected = params?.doctorId === "all";
  const doctorFilter = requestedDoctor ?? (allDoctorsSelected ? "all" : "");
  const timezone = doctors.find((doctor) => doctor.doctor_id === requestedDoctor)?.timezone ?? doctors[0]?.timezone ?? "UTC";
  const serviceDate = parseQueueServiceDate(params?.date, timezone);
  const rows = doctorFilter ? await getQueueBoard(undefined, requestedDoctor, serviceDate) : [];
  const slotId = rows.some((row) => row.slot_id === params?.slotId) ? params?.slotId ?? "" : "";
  return <QueueBoard rows={rows} doctors={doctors} serviceDate={serviceDate} doctorId={doctorFilter} slotId={slotId} allowAllDoctors={true} />;
}
