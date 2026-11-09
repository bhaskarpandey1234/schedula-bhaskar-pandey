"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile, requireVerifiedUser } from "@/lib/auth/guards";
import { suggestElasticAssignments, type ElasticAssignment, type ElasticPreview } from "@/lib/availability/elastic";

function userFacingAvailabilityError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("active payment hold")) return "An active payment hold is using this occurrence. Wait for checkout to finish or expire, then preview again.";
  if (message.includes("stale") || message.includes("no longer available")) return "Availability changed while you were reviewing it. Refresh the schedule and preview again.";
  if (message.includes("overlap")) return "The new window overlaps another availability session.";
  if (message.includes("future")) return "Only future availability can be edited.";
  if (message.includes("align")) return "Wave boundaries must align with the appointment duration.";
  if (message.includes("pure shrink")) return "Choose a pure shrink or pure expansion; shifting both edges is not supported.";
  return "We could not update this availability. Please review the window and try again.";
}

export async function previewElasticAvailabilityAction(input: { sessionId: string; occurrenceDate: string; startTime: string; endTime: string }): Promise<{ preview: ElasticPreview; assignments: ElasticAssignment[] }> {
  await requireCompleteProfile("doctor");
  await requireVerifiedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_doctor_occurrence_adjustment", { p_session_id: input.sessionId, p_occurrence_date: input.occurrenceDate, p_start_time: input.startTime, p_end_time: input.endTime });
  if (error) throw new Error(userFacingAvailabilityError(error));
  const preview = data as ElasticPreview;
  return { preview, assignments: suggestElasticAssignments(preview) };
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
