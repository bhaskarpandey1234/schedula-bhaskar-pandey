"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { patientOnboardingSchema } from "@/lib/validation/auth";
import { formValues, firstZodError, type FormActionState, zodFieldErrors } from "@/lib/forms/action-state";

export type PatientProfileActionState = FormActionState;

export async function updatePatientProfileAction(_: PatientProfileActionState, formData: FormData): Promise<PatientProfileActionState> {
  const values = formValues(formData);
  const parsed = patientOnboardingSchema.safeParse(values);
  if (!parsed.success) return { error: firstZodError(parsed.error) ?? "Check the profile details and try again.", fieldErrors: zodFieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Your patient session is no longer valid.", values };
  const { error } = await supabase.rpc("update_patient_profile", { p_full_name: parsed.data.fullName, p_phone: parsed.data.phone, p_date_of_birth: parsed.data.dateOfBirth });
  if (error) return { error: "We could not update your profile. Please try again.", values };
  revalidatePath("/patient");
  revalidatePath("/patient/profile");
  return { success: true };
}
