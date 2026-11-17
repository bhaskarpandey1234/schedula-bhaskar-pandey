"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getCurrentAccount } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfirmRedirect } from "@/lib/auth/redirects";

export type AdminActionState = { error?: string; success?: string; stale?: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function clinicAdminAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const account = await getCurrentAccount();
  if (!account || !account.emailVerified) return { error: "Your session expired. Sign in and refresh before trying again.", stale: true };
  if (account.profile?.role !== "admin" || !account.onboardingComplete) return { error: "Admin access is required." };
  const operation = String(formData.get("operation") ?? "");
  const clinicId = String(formData.get("clinicId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const doctorId = String(formData.get("doctorId") ?? "");
  const staffId = String(formData.get("staffId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (operation !== "create_clinic" && !uuid.test(clinicId)) return { error: "Choose a clinic." };
  const supabase = await createClient();
  if (operation === "create_clinic") {
    if (name.length < 2 || name.length > 160) return { error: "Enter a clinic name of 2–160 characters." };
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { return { error: "Enter a valid IANA timezone." }; }
    const { error } = await supabase.rpc("admin_create_clinic", { p_name: name, p_timezone: timezone });
    if (error) return { error: "The clinic could not be created. Refresh and try again.", stale: true };
  } else if (operation === "assign_doctor") {
    if (!uuid.test(doctorId)) return { error: "Choose a doctor." };
    const { error } = await supabase.rpc("admin_assign_doctor_clinic", { p_doctor_id: doctorId, p_clinic_id: clinicId });
    if (error) return { error: "The doctor could not be moved. Resolve active queue entries and refresh clinic assignments.", stale: true };
  } else if (operation === "assign_staff") {
    if (!uuid.test(staffId)) return { error: "Choose a staff member." };
    const { error } = await supabase.rpc("admin_assign_staff_clinic", { p_staff_id: staffId, p_clinic_id: clinicId });
    if (error) return { error: "Staff assignment failed. Refresh and try again.", stale: true };
  } else if (operation === "invite_staff") {
    if (name.length < 2 || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Enter the staff member’s name and a valid email." };
    }
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!key || !url) return { error: "Staff invitations are not configured. Contact the system operator." };
    const service = createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      data: { role: "patient", full_name: name },
      redirectTo: getAuthConfirmRedirect("/auth/update-password"),
    });
    if (error || !data.user) return { error: "The invitation could not be sent. Check whether this email already has an account." };
    const promoted = await service.from("profiles").update({ role: "staff" }).eq("id", data.user.id).eq("role", "patient").select("id").single();
    if (promoted.error) return { error: "Invitation sent, but staff provisioning failed. Contact the system operator.", stale: true };
    const metadata = await service.auth.admin.updateUserById(data.user.id, { user_metadata: { role: "staff", full_name: name } });
    if (metadata.error) return { error: "Staff account created, but its profile metadata needs repair. Contact the system operator.", stale: true };
    const assigned = await supabase.rpc("admin_assign_staff_clinic", { p_staff_id: data.user.id, p_clinic_id: clinicId });
    if (assigned.error) return { error: "Invitation sent, but clinic assignment failed. Assign this staff member from the list below.", stale: true };
  } else return { error: "Unknown clinic action." };
  revalidatePath("/admin");
  revalidatePath("/staff");
  return { success: operation === "invite_staff" ? "Staff invitation sent and clinic assigned." : "Clinic settings updated." };
}
