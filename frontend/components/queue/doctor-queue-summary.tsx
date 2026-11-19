import { getDoctorQueueSummary } from "@/lib/queue/queries";
import { DoctorQueueSummaryView } from "@/components/queue/doctor-queue-summary-view";

export async function DoctorQueueSummaryPanel({ doctorId, compact = false }: { doctorId: string; compact?: boolean }) {
  const summary = await getDoctorQueueSummary(doctorId);
  return <DoctorQueueSummaryView summary={summary} compact={compact} />;
}
