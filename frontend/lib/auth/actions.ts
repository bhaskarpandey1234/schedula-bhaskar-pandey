"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfirmRedirect } from "@/lib/auth/redirects";
import { authErrorMessage } from "@/lib/auth/errors";
import { safeReturnPath } from "@/lib/auth/return-path";
import { formValues, firstZodError, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";
import {
  doctorOnboardingSchema,
  emailSchema,
  patientOnboardingSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth";

export type ActionState = FormActionState;

function validationError(error: unknown, formData: FormData): ActionState {
  return { error: firstZodError(error) ?? "Check the form and try again.", fieldErrors: zodFieldErrors(error), values: formValues(formData) };
}

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { role: parsed.data.role } },
  });
  if (error) { const friendly = authErrorMessage(error); return { error: friendly.message, code: friendly.code, values: formValues(formData) }; }
  return { success: true, values: { email: parsed.data.email, role: parsed.data.role } };
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) { const friendly = authErrorMessage(error); return { error: friendly.message, code: friendly.code, values: formValues(formData) }; }
  redirect(safeReturnPath(formData.get("next")) ?? "/auth/continue");
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: getAuthConfirmRedirect("/auth/update-password"),
  });
  if (error) return { error: "We could not send a reset email right now. Please check the address and try again.", values: formValues(formData) };
  return { success: true };
}

export async function updatePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updatePasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "We could not update your password. Please try again.", values: formValues(formData) };
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
  const parsed = patientOnboardingSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { supabase, user } = await currentUserAndRole("patient");
  if (!user) return { error: "Your session or role is no longer valid. Please sign in again.", values: formValues(formData) };
  const { error } = await supabase.rpc("complete_patient_onboarding", {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_date_of_birth: parsed.data.dateOfBirth,
  });
  if (error) return { error: "We could not save your patient details. Please review the highlighted fields and try again.", values: formValues(formData) };
  redirect("/patient");
}

export async function completeDoctorOnboarding(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = doctorOnboardingSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { supabase, user } = await currentUserAndRole("doctor");
  if (!user) return { error: "Your session or role is no longer valid. Please sign in again.", values: formValues(formData) };
  const { error } = await supabase.rpc("complete_doctor_onboarding", {
    p_full_name: parsed.data.fullName,
    p_specialty: parsed.data.specialty,
    p_clinic_name: parsed.data.clinicName,
    p_experience_years: parsed.data.experienceYears,
    p_biography: parsed.data.biography,
    p_timezone: parsed.data.timezone,
  });
  if (error) return { error: "We could not save your doctor details. Please review the highlighted fields and try again.", values: formValues(formData) };
  redirect("/doctor");
}
