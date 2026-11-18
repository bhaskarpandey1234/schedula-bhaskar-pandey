import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { DoctorQueueSummaryView } from "@/components/queue/doctor-queue-summary-view";
import { createClient } from "@/lib/supabase/server";
import { getDoctorQueuePatients, getDoctorQueueSummaryForSlot, parseQueueServiceDate } from "@/lib/queue/queries";

export const instant = false;

export default async function DoctorQueuePage({
  searchParams,
}: {
    searchParams?: Promise<{ date?: string | string[]; slot?: string | string[]; showQueue?: string | string[] }>;
}) {
  await connection();
  const account = await requireRole("doctor");
  const params = await searchParams;
  const supabase = await createClient();
  const { data: doctor, error } = await supabase
    .from("doctors")
    .select("timezone")
    .eq("id", account.user.id)
    .single();
  if (error) throw new Error("Your doctor schedule could not be loaded.");
  if (!doctor) throw new Error("Your doctor profile could not be found.");

  const requestedDate = typeof params?.date === "string" ? params.date : undefined;
  const serviceDate = parseQueueServiceDate(requestedDate, doctor.timezone);
  const schedule = await getDoctorSchedule(serviceDate);
  const slots = schedule.slots.filter((slot) => slot.status === "available").map(({ id, slot_start_at, slot_end_at }) => ({
    slot_id: id,
    slot_start_at,
    slot_end_at,
  }));
  const requestedSlot = typeof params?.slot === "string" ? params.slot : "";
  const showQueue = params?.showQueue !== "0";
  const isAllSlots = requestedSlot === "" || requestedSlot === "all";
  const selectedSlot = isAllSlots ? null : slots.find((slot) => slot.slot_id === requestedSlot) ?? null;
  const selectedSlotId = selectedSlot ? selectedSlot.slot_id : "";

  if (requestedSlot && !isAllSlots && !selectedSlot && slots.length > 0) {
    const query = new URLSearchParams({ date: serviceDate, slot: "" });
    if (!showQueue) query.set("showQueue", "0");
    redirect(`/doctor/queue?${query.toString()}`);
  }

  const [summary, patients] = showQueue
    ? await Promise.all([
        getDoctorQueueSummaryForSlot(account.user.id, serviceDate, selectedSlotId || null),
        getDoctorQueuePatients(account.user.id, serviceDate, selectedSlotId || null),
      ])
    : [null, []];

  return (
    <DoctorQueueSummaryView
      summary={summary}
      initialPatients={patients}
      filters={{
        serviceDate,
        timezone: doctor.timezone,
        slots,
        selectedSlotId,
        showQueue,
      }}
    />
  );
}
