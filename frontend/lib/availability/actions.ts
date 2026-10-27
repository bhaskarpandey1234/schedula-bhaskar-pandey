"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { availabilitySessionSchema } from "@/lib/validation/availability";
import { doctorProfileSchema } from "@/lib/validation/doctor-profile";

export type AvailabilityActionState = { error?: string; success?: boolean };

function values(formData: FormData) { return Object.fromEntries(formData.entries()); }
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
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the profile details and try again." };
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid." };
  const { fullName, specialty, clinicName, experienceYears, biography, timezone } = parsed.data;
  const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (profileError) return { error: "We could not update your profile name." };
  const { error } = await supabase.from("doctors").update({ specialty, clinic_name: clinicName, experience_years: experienceYears, biography, timezone }).eq("id", user.id);
  if (error) return { error: "We could not update your professional details." };
  return { success: true };
}

export async function createAvailabilityAction(_: AvailabilityActionState, formData: FormData): Promise<AvailabilityActionState> {
  const parsed = availabilitySessionSchema.safeParse(values(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) ?? "Check the availability details and try again." };
  const { supabase, user } = await currentDoctor();
  if (!user) return { error: "Your doctor session is no longer valid." };
  const { data, error } = await supabase.rpc("create_availability_session_with_slots", {
    p_session_date: parsed.data.sessionDate,
    p_start_time: parsed.data.startTime,
    p_end_time: parsed.data.endTime,
    p_timezone: parsed.data.timezone,
    p_interval_minutes: parsed.data.intervalMinutes,
    p_capacity: parsed.data.capacity,
  });
  if (error) return { error: error.message.includes("overlaps") ? "This window overlaps an existing session." : error.message.includes("future") ? "Availability must start in the future." : "We could not create this availability." };
  if (!data) return { error: "We could not create this availability." };
  redirect(`/doctor?date=${encodeURIComponent(parsed.data.sessionDate)}`);
}

export async function getDoctorSchedule(sessionDate: string) {
  const { supabase, user } = await currentDoctor();
  if (!user) redirect("/auth/login");
  const { data: sessions, error: sessionError } = await supabase.from("availability_sessions").select("id, session_date, start_time, end_time, timezone, interval_minutes, capacity, status").eq("doctor_id", user.id).eq("session_date", sessionDate).order("start_time");
  if (sessionError || !sessions?.length) return { sessions: [], slots: [] };
  const ids = sessions.map((session) => session.id);
  const { data: slots } = await supabase.from("appointment_slots").select("id, availability_session_id, slot_start_at, slot_end_at, capacity, allocated_count, status").in("availability_session_id", ids).order("slot_start_at");
  return { sessions, slots: slots ?? [] };
}
