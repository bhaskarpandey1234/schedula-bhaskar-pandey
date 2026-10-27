"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfirmRedirect } from "@/lib/auth/redirects";
import {
  doctorOnboardingSchema,
  emailSchema,
  patientOnboardingSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth";

export type ActionState = { error?: string; success?: boolean };

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function validationError(error: unknown): ActionState {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: Array<{ message: string }> }).issues;
    return { error: issues[0]?.message ?? "Check the form and try again." };
  }
  return { error: "Check the form and try again." };
}

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(values(formData));
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, role: parsed.data.role },
      emailRedirectTo: getAuthConfirmRedirect("/onboarding"),
    },
  });
  if (error) return { error: error.message };
  redirect("/auth/sign-up-success");
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(values(formData));
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Unable to sign in with those credentials." };
  redirect("/auth/continue");
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(values(formData));
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: getAuthConfirmRedirect("/auth/update-password"),
  });
  if (error) return { error: "Unable to send a reset email right now." };
  return { success: true };
}

export async function updatePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updatePasswordSchema.safeParse(values(formData));
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  redirect("/auth/continue");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

async function currentUserAndRole(expectedRole: "patient" | "doctor") {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!profile || profile.role !== expectedRole) return { supabase, user: null, profile: null };
  return { supabase, user: userData.user, profile };
}

export async function completePatientOnboarding(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = patientOnboardingSchema.safeParse(values(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { supabase, user } = await currentUserAndRole("patient");
  if (!user) return { error: "Your session or role is no longer valid. Please sign in again." };
  const { error } = await supabase.from("patients").upsert({ id: user.id, phone: parsed.data.phone, date_of_birth: parsed.data.dateOfBirth }, { onConflict: "id" });
  if (error) return { error: "We could not save your patient details." };
  redirect("/patient");
}

export async function completeDoctorOnboarding(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = doctorOnboardingSchema.safeParse(values(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { supabase, user } = await currentUserAndRole("doctor");
  if (!user) return { error: "Your session or role is no longer valid. Please sign in again." };
  const { error } = await supabase.from("doctors").upsert({ id: user.id, specialty: parsed.data.specialty, clinic_name: parsed.data.clinicName, experience_years: parsed.data.experienceYears, biography: parsed.data.biography, timezone: parsed.data.timezone }, { onConflict: "id" });
  if (error) return { error: "We could not save your doctor details." };
  redirect("/doctor");
}
