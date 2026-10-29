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
  const { fullName, specialty, clinicName, experienceYears, biography, timezone } = parsed.data;
  const { error } = await supabase.rpc("update_doctor_profile", { p_full_name: fullName, p_specialty: specialty, p_clinic_name: clinicName, p_experience_years: experienceYears, p_biography: biography, p_timezone: timezone });
  if (error) return { error: "We could not update your professional details. Please try again.", values: values(formData) };
  revalidatePath("/doctors", "page");
  revalidatePath(`/doctors/${user.id}`, "page");
  return { success: true };
}

export async function createAvailabilityAction(_: AvailabilityActionState, formData: FormData): Promise<AvailabilityActionState> {
  const parsed = availabilitySessionSchema.safeParse(values(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the availability details and try again.", fieldErrors: zodFieldErrors(parsed.error), values: values(formData) };
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid.", values: values(formData) };
  const { data, error } = await supabase.rpc("create_availability_session_with_slots", {
    p_session_date: parsed.data.sessionDate,
    p_start_time: parsed.data.startTime,
    p_end_time: parsed.data.endTime,
    p_timezone: parsed.data.timezone,
    p_interval_minutes: parsed.data.intervalMinutes,
    p_capacity: parsed.data.capacity,
  });
  if (error) return { error: error.message.includes("overlaps") ? "This window overlaps an existing session." : error.message.includes("future") ? "Availability must start in the future." : "We could not create this availability. Please review the fields and try again.", values: values(formData) };
  if (!data) return { error: "We could not create this availability.", values: values(formData) };
  revalidatePath("/doctors", "page");
  revalidatePath(`/doctors/${user.id}`, "page");
  redirect(`/doctor/schedule?date=${encodeURIComponent(parsed.data.sessionDate)}&created=1#schedule`);
}

export async function getDoctorSchedule(sessionDate: string) {
  const { supabase, user } = await currentDoctor();
  if (!user) redirect("/auth/login");
  const { data: sessions, error: sessionError } = await supabase.from("availability_sessions").select("id, session_date, start_time, end_time, timezone, interval_minutes, capacity, status").eq("doctor_id", user.id).eq("session_date", sessionDate).order("start_time");
  if (sessionError || !sessions?.length) return { sessions: [], slots: [], appointments: [] };
  const ids = sessions.map((session) => session.id);
  const { data: slots } = await supabase.from("appointment_slots").select("id, availability_session_id, slot_start_at, slot_end_at, capacity, allocated_count, status").in("availability_session_id", ids).order("slot_start_at");
  const appointments = await getDoctorScheduleAppointments(sessionDate);
  return { sessions, slots: slots ?? [], appointments };
}
