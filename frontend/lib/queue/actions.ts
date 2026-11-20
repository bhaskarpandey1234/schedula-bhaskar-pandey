"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAccount } from "@/lib/auth/guards";

export type QueueActionState = { error?: string; success?: string; stale?: boolean };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set(["check_in", "no_show", "reverse_no_show", "call_next", "skip", "return", "complete"]);

export async function queueAction(_: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const account = await getCurrentAccount();
  if (!account || !account.emailVerified) return { error: "Your session expired. Sign in and refresh the queue before trying again.", stale: true };
  if (!account.profile || !["staff", "admin", "doctor"].includes(account.profile.role)) return { error: "Queue actions are restricted to clinic staff and doctors." };
  if (!account.onboardingComplete) return { error: "Complete your profile before managing the queue." };
  const action = String(formData.get("action") ?? "");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (account.profile.role === "doctor" && ["check_in", "no_show", "reverse_no_show"].includes(action)) {
    return { error: "Check-in and no-show actions are managed by clinic reception staff." };
  }
  if (!actions.has(action) || !uuid.test(appointmentId) || (!["check_in", "no_show", "reverse_no_show"].includes(action) && !uuid.test(entryId))) {
    return { error: "This queue action is invalid. Refresh the board and try again.", stale: true };
  }
  if (action === "reverse_no_show" && reason.length < 3) return { error: "Enter a reason of at least three characters." };
  const supabase = await createClient();

  // If completing an entry that is currently in 'called' status, start consultation first then complete
  if (action === "complete" && entryId) {
    const { data: qEntry } = await supabase
      .from("queue_entries")
      .select("status")
      .eq("id", entryId)
      .maybeSingle();
    if (qEntry?.status === "called") {
      await supabase.rpc("transition_queue_entry", { p_entry_id: entryId, p_action: "start" });
    }
  }

  let { error } = action === "check_in"
    ? await supabase.rpc("check_in_appointment", { p_appointment_id: appointmentId })
    : action === "no_show"
      ? await supabase.rpc("mark_appointment_no_show", { p_appointment_id: appointmentId })
      : action === "reverse_no_show"
        ? await supabase.rpc("reverse_appointment_no_show", { p_appointment_id: appointmentId, p_reason: reason })
        : await supabase.rpc("transition_queue_entry", { p_entry_id: entryId, p_action: action });

  // If check-in is attempted for an unavailable (no-show) patient, automatically reverse the no-show and check them in
  if (action === "check_in" && error && error.message.toLowerCase().includes("reverse no-show before check-in")) {
    const { error: reverseError } = await supabase.rpc("reverse_appointment_no_show", {
      p_appointment_id: appointmentId,
      p_reason: "Patient arrived for consultation",
    });
    if (reverseError) {
      console.error("[queue] reverse_no_show_on_check_in_failed", reverseError);
      return { error: reverseError.message };
    }
    const retry = await supabase.rpc("check_in_appointment", { p_appointment_id: appointmentId });
    error = retry.error;
  }
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("access denied") || message.includes("access required")) return { error: "You do not have access to this queue." };
    if (message.includes("grace period")) return { error: "The no-show grace period has not ended. Refresh to see the current time." };
    if (message.includes("check-in opens on the appointment service date")) return { error: "Check-in is available only on the appointment date." };
    if (message.includes("reverse no-show before check-in")) return { error: "This appointment is marked Unavailable. Review its status before checking in." };
    if (message.includes("appointment token is not available")) {
      return { error: "This booking has no queue token. Refresh the board; if the issue continues, contact support.", stale: true };
    }
    console.error("[queue] action_failed", { action, code: error.code ?? null });
    return { error: "The appointment or queue changed. Refresh the board and review it before trying again.", stale: true };
  }
  revalidatePath("/doctor/queue");
  revalidatePath("/staff");
  revalidatePath("/admin/queue");
  revalidatePath("/patient");
  revalidatePath("/patient/appointments");
  return { success: action === "check_in" ? "Patient checked in with their existing booking token." : "Queue updated." };
}
export async function autoSyncExpiredNoShows(appointmentIds: string[]): Promise<void> {
  const account = await getCurrentAccount();
  if (!account || !account.profile || !["staff", "admin"].includes(account.profile.role)) return;
  if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) return;

  const validIds = appointmentIds.filter((id) => uuid.test(id)).slice(0, 50);
  if (validIds.length === 0) return;

  const supabase = await createClient();
  await Promise.allSettled(
    validIds.map((id) => supabase.rpc("mark_appointment_no_show", { p_appointment_id: id }))
  );
}
