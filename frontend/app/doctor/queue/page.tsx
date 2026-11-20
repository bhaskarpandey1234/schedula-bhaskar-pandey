import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { DoctorQueueSummaryView } from "@/components/queue/doctor-queue-summary-view";
import { createClient } from "@/lib/supabase/server";
import { getDoctorQueuePatients, getDoctorQueueSummaryForSlot, parseQueueServiceDate } from "@/lib/queue/queries";
import type { ClinicalPrescription, ClinicalPrescriptionItem } from "@/lib/clinical/queries";

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

  const initialPrescriptions: Record<string, ClinicalPrescription> = {};
  if (patients.length > 0) {
    const appointmentIds = patients.map((p) => p.appointment_id);
    const { data: rxData } = await supabase
      .from("prescriptions")
      .select(`
        id,
        appointment_id,
        doctor_id,
        patient_id,
        status,
        notes,
        published_at,
        created_at,
        items:prescription_items (
          id,
          prescription_id,
          medication_name,
          dosage,
          frequency,
          duration,
          instructions,
          sort_order
        )
      `)
      .in("appointment_id", appointmentIds)
      .eq("status", "published");

    if (rxData) {
      for (const rx of rxData) {
        initialPrescriptions[rx.appointment_id] = {
          ...rx,
          items: ((rx.items ?? []) as ClinicalPrescriptionItem[]).sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          ),
        };
      }
    }
  }

  return (
    <DoctorQueueSummaryView
      summary={summary}
      initialPatients={patients}
      initialPrescriptions={initialPrescriptions}
      filters={{
        serviceDate,
        timezone: doctor.timezone,
        slots,
        selectedSlotId,
        showQueue,
      }}
      doctorInfo={{
        name: account.profile?.full_name || "Doctor",
      }}
    />
  );
}
