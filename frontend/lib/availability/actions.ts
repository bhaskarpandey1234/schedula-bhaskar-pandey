"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { availabilitySessionSchema } from "@/lib/validation/availability";
import { doctorProfileSchema } from "@/lib/validation/doctor-profile";
import { formValues, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";
import { requireCompleteProfile, requireVerifiedUser } from "@/lib/auth/guards";
import { deriveRecurrenceEndDate } from "@/lib/scheduling/recurrence";

export type AvailabilityActionState = FormActionState;
type DoctorScheduleSlot = { id: string; availability_session_id: string; slot_start_at: string; slot_end_at: string; capacity: number; allocated_count: number; status: string; scheduling_type: "wave" | "stream" };

function values(formData: FormData) { return formValues(formData); }
function availabilityValues(formData: FormData) {
  const submitted = values(formData);
  submitted.consultingDays = formData.getAll("consultingDays").map(String).join(",");
  submitted.monthlyDays = formData.getAll("monthlyDays").map(String).join(",");
  submitted.sessionDates = formData.getAll("sessionDates").map(String).join(",");
  return submitted;
}
function firstIssue(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) return (error as { issues: Array<{ message: string }> }).issues[0]?.message;
  return undefined;
}

async function currentDoctor() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, user: null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (profile?.role !== "doctor") return { supabase, user: null };
  return { supabase, user: userData.user };
}

export async function updateDoctorProfileAction(_: AvailabilityActionState, formData: FormData): Promise<AvailabilityActionState> {
  const parsed = doctorProfileSchema.safeParse(values(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the profile details and try again.", fieldErrors: zodFieldErrors(parsed.error), values: values(formData) };
  try { await requireVerifiedUser(); } catch (error) { if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return { error: "Verify your email before editing your profile.", values: values(formData) }; throw error; }
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid.", values: values(formData) };
  const { fullName, phone, specialty, clinicName, experienceYears, biography, timezone, consultationFee } = parsed.data;
  const { error } = await supabase.rpc("update_doctor_profile", { p_full_name: fullName, p_phone: phone, p_specialty: specialty, p_clinic_name: clinicName, p_experience_years: experienceYears, p_biography: biography, p_timezone: timezone, p_consultation_fee_minor: Math.round(consultationFee * 100) });
  if (error) return { error: "We could not update your professional details. Please try again.", values: values(formData) };
  revalidatePath("/doctors", "page");
  revalidatePath(`/doctors/${user.id}`, "page");
  return { success: true };
}

export async function createAvailabilityAction(_: AvailabilityActionState, formData: FormData): Promise<AvailabilityActionState> {
  const submittedValues = availabilityValues(formData);
  const raw = submittedValues;
  const sessionType = String(raw.sessionType ?? "");
  const recurrenceMethod = String(raw.recurrenceMethod ?? "");
  const mode = sessionType === "recurring" && recurrenceMethod === "day" ? "weekly" : sessionType === "recurring" && recurrenceMethod === "date" ? "monthly_days" : "specific_dates";
  const parsed = availabilitySessionSchema.safeParse({
    ...raw,
    consultingDays: mode === "weekly" ? formData.getAll("consultingDays") : undefined,
    monthlyDays: mode === "monthly_days" ? formData.getAll("monthlyDays") : undefined,
    sessionDates: mode === "specific_dates" ? formData.getAll("sessionDates") : undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the availability details and try again.", fieldErrors: zodFieldErrors(parsed.error), values: submittedValues };
  try { await requireCompleteProfile("doctor"); } catch (error) { if (error instanceof Error && error.message === "PROFILE_INCOMPLETE") return { error: "Complete your doctor profile before creating availability.", values: submittedValues }; throw error; }
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid.", values: submittedValues };
  const recurrenceEndDate = parsed.data.sessionType === "recurring" && parsed.data.recurrenceStartDate && parsed.data.recurrenceDuration
    ? deriveRecurrenceEndDate(parsed.data.recurrenceStartDate, parsed.data.recurrenceDuration as Parameters<typeof deriveRecurrenceEndDate>[1])
    : undefined;
  const rpcName = mode === "weekly" ? "create_weekly_availability_with_slots" : mode === "monthly_days" ? "create_monthly_availability_with_days" : "create_specific_date_availability_with_slots";
  const scheduleArgs = { p_scheduling_type: parsed.data.schedulingType, p_interval_minutes: parsed.data.intervalMinutes ?? null, p_capacity: parsed.data.capacity };
  const rpcArgs = mode === "weekly"
    ? { p_consulting_days: parsed.data.consultingDays, p_recurrence_start_date: parsed.data.recurrenceStartDate, p_recurrence_end_date: recurrenceEndDate, p_start_time: parsed.data.startTime, p_end_time: parsed.data.endTime, p_timezone: parsed.data.timezone, ...scheduleArgs }
    : mode === "monthly_days"
      ? { p_monthly_days: parsed.data.monthlyDays, p_recurrence_start_date: parsed.data.recurrenceStartDate, p_recurrence_end_date: recurrenceEndDate, p_start_time: parsed.data.startTime, p_end_time: parsed.data.endTime, p_timezone: parsed.data.timezone, ...scheduleArgs }
      : { p_session_dates: parsed.data.sessionDates, p_start_time: parsed.data.startTime, p_end_time: parsed.data.endTime, p_timezone: parsed.data.timezone, ...scheduleArgs };
  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) {
    const message = error.message.toLowerCase();
    const userMessage = message.includes("does not exist") || message.includes("function")
      ? "Availability scheduling is temporarily unavailable while the scheduling database is being updated."
      : message.includes("existing bookings") || message.includes("payment hold")
        ? "This date has protected recurring bookings or payment holds and cannot be replaced."
        : message.includes("overlaps")
          ? "This window overlaps an existing session."
          : message.includes("future")
            ? "Availability must start in the future."
            : "We could not create this availability. Please review the fields and try again.";
    return { error: userMessage, values: submittedValues };
  }
  if (!data) return { error: "We could not create this availability.", values: submittedValues };
  revalidatePath("/doctors", "page");
  revalidatePath(`/doctors/${user.id}`, "page");
  const redirectDate = parsed.data.sessionDates?.[0] ?? parsed.data.recurrenceStartDate ?? nextConsultingDate(parsed.data.consultingDays ?? [], parsed.data.timezone);
  redirect(`/doctor/schedule?date=${encodeURIComponent(redirectDate)}&mode=${mode}&created=1`);
}

function nextConsultingDate(days: number[], timezone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const current = new Date(`${today}T12:00:00Z`);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(current);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const weekday = ((candidate.getUTCDay() + 6) % 7) + 1;
    if (days.includes(weekday)) return candidate.toISOString().slice(0, 10);
  }
  return today;
}

export async function getDoctorSchedule(sessionDate: string | "all") {
  await requireVerifiedUser();
  const { supabase, user } = await currentDoctor();
  if (!user) redirect("/auth/login");
  await supabase.rpc("materialize_recurring_availability_slots", { p_doctor_id: user.id });
  const { data: slots } = await supabase.from("appointment_slots").select("id, availability_session_id, slot_start_at, slot_end_at, capacity, allocated_count, status, availability_sessions!inner(scheduling_type)").eq("doctor_id", user.id).order("slot_start_at");
  const { data: doctor } = await supabase.from("doctors").select("timezone").eq("id", user.id).single();
  const rawSlots = (slots ?? []) as Array<Record<string, unknown> & { slot_start_at: string }>;
  const selectedSlots = rawSlots.map((slot) => ({ ...slot, scheduling_type: ((Array.isArray(slot.availability_sessions) ? (slot.availability_sessions[0] as { scheduling_type?: string } | undefined)?.scheduling_type : (slot.availability_sessions as { scheduling_type?: string } | undefined)?.scheduling_type) ?? "wave") as "wave" | "stream" }) as unknown as DoctorScheduleSlot).filter((slot) => doctor && (sessionDate === "all" || new Intl.DateTimeFormat("en-CA", { timeZone: doctor.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(slot.slot_start_at)) === sessionDate));
  const sessions: Array<never> = [];
  if (!selectedSlots.length) return { sessions, slots: [], appointments: [] };
  return { sessions, slots: selectedSlots };
}
