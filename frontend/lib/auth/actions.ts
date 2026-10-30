"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfirmRedirect } from "@/lib/auth/redirects";
import { authErrorDiagnostic, authErrorMessage } from "@/lib/auth/errors";
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
  return { success: true, code: "verification_required", values: { email: parsed.data.email, role: parsed.data.role } };
}

export async function resendVerificationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: { emailRedirectTo: getAuthConfirmRedirect("/onboarding") },
    });
    if (error) {
      const friendly = authErrorMessage(error);
      if (friendly.code === "rate_limited") return { error: friendly.message, code: friendly.code, values: { email: parsed.data.email } };
      return { error: "We could not send a verification email right now. Please try again later.", code: "verification_resend_failed", values: { email: parsed.data.email } };
    }
  } catch (error) {
    console.error("[auth] verification resend failed", authErrorDiagnostic(error, "verification_resend"));
    return { error: "We could not send a verification email right now. Please try again later.", code: "verification_resend_failed", values: { email: parsed.data.email } };
  }
  return { success: true, code: "verification_resend_sent", values: { email: parsed.data.email } };
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  let error: unknown;
  try {
    const supabase = await createClient();
    ({ error } = await supabase.auth.signInWithPassword(parsed.data));
  } catch (exception) {
    console.error("[auth] sign-in exception", authErrorDiagnostic(exception, "password_sign_in_exception"));
    const friendly = authErrorMessage(exception);
    return { error: friendly.message, code: friendly.code, values: formValues(formData) };
  }
  if (error) { console.error("[auth] sign-in failed", authErrorDiagnostic(error)); const friendly = authErrorMessage(error); return { error: friendly.message, code: friendly.code, values: formValues(formData) }; }
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
  if (!userData.user) return { supabase, user: null, profile: null, unverified: false };
  if (!userData.user.email_confirmed_at) return { supabase, user: null, profile: null, unverified: true };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!profile || profile.role !== expectedRole) return { supabase, user: null, profile: null, unverified: false };
  return { supabase, user: userData.user, profile, unverified: false };
}

export async function completePatientOnboarding(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = patientOnboardingSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { supabase, user, unverified } = await currentUserAndRole("patient");
  if (!user) return { error: unverified ? "Verify your email before completing your profile." : "Your session or role is no longer valid. Please sign in again.", values: formValues(formData) };
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
  const { supabase, user, unverified } = await currentUserAndRole("doctor");
  if (!user) return { error: unverified ? "Verify your email before completing your profile." : "Your session or role is no longer valid. Please sign in again.", values: formValues(formData) };
  const { error } = await supabase.rpc("complete_doctor_onboarding", {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_specialty: parsed.data.specialty,
    p_clinic_name: parsed.data.clinicName,
    p_experience_years: parsed.data.experienceYears,
    p_biography: parsed.data.biography,
    p_timezone: parsed.data.timezone,
    p_consultation_fee_minor: Math.round(parsed.data.consultationFee * 100),
  });
  if (error) return { error: "We could not save your doctor details. Please review the highlighted fields and try again.", values: formValues(formData) };
  redirect("/doctor");
}
