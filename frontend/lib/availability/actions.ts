"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { availabilitySessionSchema } from "@/lib/validation/availability";
import { doctorProfileSchema } from "@/lib/validation/doctor-profile";
import { getDoctorScheduleAppointments } from "@/lib/appointments/queries";
import { formValues, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";

export type AvailabilityActionState = FormActionState;

function values(formData: FormData) { return formValues(formData); }
function availabilityValues(formData: FormData) {
  const submitted = values(formData);
  submitted.consultingDays = formData.getAll("consultingDays").map(String).join(",");
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
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid.", values: values(formData) };
  const { fullName, specialty, clinicName, experienceYears, biography, timezone, consultationFee } = parsed.data;
  const { error } = await supabase.rpc("update_doctor_profile", { p_full_name: fullName, p_specialty: specialty, p_clinic_name: clinicName, p_experience_years: experienceYears, p_biography: biography, p_timezone: timezone, p_consultation_fee_minor: Math.round(consultationFee * 100) });
  if (error) return { error: "We could not update your professional details. Please try again.", values: values(formData) };
  revalidatePath("/doctors", "page");
  revalidatePath(`/doctors/${user.id}`, "page");
  return { success: true };
}

export async function createAvailabilityAction(_: AvailabilityActionState, formData: FormData): Promise<AvailabilityActionState> {
  const submittedValues = availabilityValues(formData);
  const raw = submittedValues;
  const parsed = availabilitySessionSchema.safeParse({
    ...raw,
    consultingDays: formData.getAll("consultingDays"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the availability details and try again.", fieldErrors: zodFieldErrors(parsed.error), values: submittedValues };
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid.", values: submittedValues };
  const rpcName = parsed.data.mode === "weekly" ? "create_weekly_availability_with_slots" : "create_custom_availability_with_slots";
  const rpcArgs = parsed.data.mode === "weekly"
    ? { p_consulting_days: parsed.data.consultingDays, p_start_time: parsed.data.startTime, p_end_time: parsed.data.endTime, p_timezone: parsed.data.timezone, p_interval_minutes: parsed.data.intervalMinutes, p_capacity: parsed.data.capacity }
    : { p_session_date: parsed.data.sessionDate, p_start_time: parsed.data.startTime, p_end_time: parsed.data.endTime, p_timezone: parsed.data.timezone, p_interval_minutes: parsed.data.intervalMinutes, p_capacity: parsed.data.capacity };
  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) return { error: error.message.includes("overlaps") ? "This window overlaps an existing session." : error.message.includes("future") ? "Availability must start in the future." : "We could not create this availability. Please review the fields and try again.", values: submittedValues };
  if (!data) return { error: "We could not create this availability.", values: submittedValues };
  revalidatePath("/doctors", "page");
  revalidatePath(`/doctors/${user.id}`, "page");
  const redirectDate = parsed.data.sessionDate ?? nextConsultingDate(parsed.data.consultingDays ?? [], parsed.data.timezone);
  redirect(`/doctor/schedule?date=${encodeURIComponent(redirectDate)}&created=1#schedule`);
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

export async function getDoctorSchedule(sessionDate: string) {
  const { supabase, user } = await currentDoctor();
  if (!user) redirect("/auth/login");
  await supabase.rpc("materialize_recurring_availability_slots", { p_doctor_id: user.id });
  const { data: slots } = await supabase.from("appointment_slots").select("id, availability_session_id, slot_start_at, slot_end_at, capacity, allocated_count, status").eq("doctor_id", user.id).order("slot_start_at");
  const { data: doctor } = await supabase.from("doctors").select("timezone").eq("id", user.id).single();
  const selectedSlots = (slots ?? []).filter((slot) => doctor && new Intl.DateTimeFormat("en-CA", { timeZone: doctor.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(slot.slot_start_at)) === sessionDate);
  const sessions: Array<never> = [];
  if (!selectedSlots.length) return { sessions, slots: [], appointments: [] };
  const appointments = await getDoctorScheduleAppointments(sessionDate);
  return { sessions, slots: selectedSlots, appointments };
}
