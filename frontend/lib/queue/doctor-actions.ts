"use server";

import { getCurrentAccount } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { DoctorQueuePatientRow, DoctorQueueSummary } from "@/lib/queue/queries";
import type { ClinicalPrescription, ClinicalPrescriptionItem } from "@/lib/clinical/queries";

export type DoctorQueueSummaryActionResult =
  | {
      ok: true;
      summary: DoctorQueueSummary | null;
      patients: DoctorQueuePatientRow[];
      prescriptions?: Record<string, ClinicalPrescription>;
    }
  | { ok: false; error: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isServiceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function loadDoctorQueueSummaryAction(
  serviceDate: string,
  slotId?: string | null,
): Promise<DoctorQueueSummaryActionResult> {
  const account = await getCurrentAccount();
  if (!account || !account.emailVerified) return { ok: false, error: "Your session expired. Sign in and try again." };
  if (account.profile?.role !== "doctor" || !account.onboardingComplete) {
    return { ok: false, error: "Doctor access is required to view this queue." };
  }
  if (!isServiceDate(serviceDate) || (slotId && slotId !== "all" && !uuid.test(slotId))) {
    return { ok: false, error: "Select a valid date and time slot." };
  }

  const effectiveSlotId = slotId && slotId !== "all" ? slotId : null;
  const supabase = await createClient();
  const [summaryResult, patientsResult] = await Promise.all([
    supabase.rpc("doctor_queue_summary_for_slot", {
      p_doctor_id: account.user.id,
      p_service_date: serviceDate,
      p_slot_id: effectiveSlotId,
    }),
    supabase.rpc("doctor_queue_patients", {
      p_doctor_id: account.user.id,
      p_service_date: serviceDate,
      p_slot_id: effectiveSlotId,
    }),
  ]);

  if (summaryResult.error) return { ok: false, error: "The selected queue could not be loaded. Please try again." };
  const patients = (patientsResult.data ?? []) as DoctorQueuePatientRow[];
  const prescriptions: Record<string, ClinicalPrescription> = {};

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
        prescriptions[rx.appointment_id] = {
          ...rx,
          items: ((rx.items ?? []) as ClinicalPrescriptionItem[]).sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          ),
        };
      }
    }
  }

  return {
    ok: true,
    summary: ((summaryResult.data ?? []) as DoctorQueueSummary[])[0] ?? null,
    patients,
    prescriptions,
  };
}
