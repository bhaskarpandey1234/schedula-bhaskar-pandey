"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAccount } from "@/lib/auth/guards";

export type QueueActionState = { error?: string; success?: string; stale?: boolean };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set(["check_in", "no_show", "reverse_no_show", "call_next", "call_again", "start", "skip", "return", "complete"]);

export async function queueAction(_: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const account = await getCurrentAccount();
  if (!account || !account.emailVerified) return { error: "Your session expired. Sign in and refresh the queue before trying again.", stale: true };
  if (!account.profile || !["doctor", "staff", "admin"].includes(account.profile.role)) return { error: "Queue access denied." };
  if (!account.onboardingComplete) return { error: "Complete your profile before managing the queue." };
  const action = String(formData.get("action") ?? "");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!actions.has(action) || !uuid.test(appointmentId) || (!["check_in", "no_show", "reverse_no_show"].includes(action) && !uuid.test(entryId))) {
    return { error: "This queue action is invalid. Refresh the board and try again.", stale: true };
  }
  if (action === "reverse_no_show" && reason.length < 3) return { error: "Enter a reason of at least three characters." };
  const supabase = await createClient();
  const { error } = action === "check_in"
    ? await supabase.rpc("check_in_appointment", { p_appointment_id: appointmentId })
    : action === "no_show"
      ? await supabase.rpc("mark_appointment_no_show", { p_appointment_id: appointmentId })
      : action === "reverse_no_show"
        ? await supabase.rpc("reverse_appointment_no_show", { p_appointment_id: appointmentId, p_reason: reason })
        : await supabase.rpc("transition_queue_entry", { p_entry_id: entryId, p_action: action });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("access denied") || message.includes("access required")) return { error: "You do not have access to this queue." };
    if (message.includes("grace period")) return { error: "The no-show grace period has not ended. Refresh to see the current time." };
    if (message.includes("five minutes")) return { error: "Wait five minutes after calling before skipping this patient." };
    return { error: "The appointment or queue changed. Refresh the board and review it before trying again.", stale: true };
  }
  revalidatePath("/doctor/queue");
  revalidatePath("/staff");
  revalidatePath("/admin/queue");
  revalidatePath("/patient");
  revalidatePath("/patient/appointments");
  return { success: action === "check_in" ? "Patient checked in and token issued." : "Queue updated." };
}
