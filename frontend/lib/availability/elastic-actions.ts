"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile, requireVerifiedUser } from "@/lib/auth/guards";
import { suggestElasticAssignments, userFacingAvailabilityError, type ElasticAssignment, type ElasticPreview } from "@/lib/availability/elastic";

export type ElasticPreviewActionResult = { preview: ElasticPreview; assignments: ElasticAssignment[] } | { error: string };

export async function previewElasticAvailabilityAction(input: { sessionId: string; occurrenceDate: string; startTime: string; endTime: string }): Promise<ElasticPreviewActionResult> {
  await requireCompleteProfile("doctor");
  await requireVerifiedUser();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("preview_doctor_occurrence_adjustment", { p_session_id: input.sessionId, p_occurrence_date: input.occurrenceDate, p_start_time: input.startTime, p_end_time: input.endTime });
    if (error) return { error: userFacingAvailabilityError(error) };
    if (!data || typeof data !== "object") return { error: "We could not read the availability preview. Refresh the schedule and try again." };
    const preview = data as ElasticPreview;
    return { preview, assignments: suggestElasticAssignments(preview) };
  } catch (error) {
    return { error: userFacingAvailabilityError(error) };
  }
}

export async function applyElasticAvailabilityAction(input: { sessionId: string; occurrenceDate: string; startTime: string; endTime: string; assignments: ElasticAssignment[] }) {
  await requireCompleteProfile("doctor");
  await requireVerifiedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_doctor_occurrence_adjustment", { p_session_id: input.sessionId, p_occurrence_date: input.occurrenceDate, p_start_time: input.startTime, p_end_time: input.endTime, p_assignments: input.assignments });
  if (error) throw new Error(userFacingAvailabilityError(error));
  revalidatePath("/doctor/schedule", "page");
  revalidatePath("/doctor/appointments", "page");
  revalidatePath("/doctor/notifications", "page");
  revalidatePath("/patient/appointments", "page");
  revalidatePath("/patient/notifications", "page");
  revalidatePath("/patient/payments", "page");
  return data as { adjustment_id: string; classification: string; moved: number; cancelled: number };
}
