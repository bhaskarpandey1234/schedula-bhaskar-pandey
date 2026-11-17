"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getCurrentAccount } from "@/lib/auth/guards";
import { sendEmail } from "@/lib/notifications/providers";
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
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_FROM_EMAIL) {
      return { error: "Staff invitation email is not configured. Ask the system operator to configure Brevo." };
    }
    const service = createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userPage, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return { error: "We could not verify whether this email already has a staff account. Refresh and try again.", stale: true };
    const existingUser = userPage.users.find((user) => user.email?.toLowerCase() === email);
    if (existingUser) {
      if (existingUser.email_confirmed_at) {
        return { error: "This email already belongs to a verified account. Ask that user to sign in or use password recovery." };
      }
      const { data: profile, error: profileError } = await service.from("profiles").select("role").eq("id", existingUser.id).maybeSingle();
      if (profileError) return { error: "We could not verify this account’s role. Refresh and try again.", stale: true };
      if (profile?.role !== "staff") {
        return { error: "This email already belongs to a non-staff account. Use another email or ask the system operator to review it." };
      }
    }

    const { data: invite, error: inviteError } = await service.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { role: "staff", full_name: name },
        redirectTo: getAuthConfirmRedirect("/auth/update-password"),
      },
    });
    if (inviteError || !invite.user || !invite.properties.action_link) {
      const code = inviteError?.code?.toLowerCase() ?? "";
      if (["over_email_send_rate_limit", "email_rate_limit_exceeded"].includes(code)) {
        return { error: "Supabase rate limited this invitation. Wait a few minutes and try again." };
      }
      return { error: "Supabase could not create the staff setup link. Check the account status and try again." };
    }

    if (!existingUser) {
      const { data: profile, error: profileError } = await service.from("profiles").select("role").eq("id", invite.user.id).maybeSingle();
      if (profileError || profile?.role !== "staff") return { error: "The staff account was created, but role setup failed. Contact the system operator.", stale: true };
      const assigned = await supabase.rpc("admin_assign_staff_clinic", { p_staff_id: invite.user.id, p_clinic_id: clinicId });
      if (assigned.error) return { error: "The staff account was created, but clinic assignment failed. Assign it from the staff list.", stale: true };
    }

    const delivery = await sendEmail({
      to: email,
      subject: "Set up your Schedula staff account",
      text: `Hello ${name},\n\nYou have been invited to Schedula as clinic staff. Use this one-time link to verify your email and choose a password:\n\n${invite.properties.action_link}\n\nIf you were not expecting this invitation, you can ignore this email.`,
      idempotencyKey: `staff-invite/${invite.user.id}/${invite.user.confirmation_sent_at ?? invite.user.created_at}`,
    });
    if (delivery.status !== "sent") {
      if (delivery.status === "skipped") return { error: "Brevo is not configured to send staff invitations. Contact the system operator." };
      if (delivery.errorCode === "provider_rate_limited") return { error: "Brevo rate limited this email. Wait a few minutes and retry." };
      return { error: "The setup link was created, but Brevo could not deliver it. Check Brevo delivery and retry." };
    }
    revalidatePath("/admin");
    revalidatePath("/staff");
    return { success: existingUser ? "A fresh staff setup email was sent." : "Staff invitation sent and clinic assigned." };
  } else return { error: "Unknown clinic action." };
  revalidatePath("/admin");
  revalidatePath("/staff");
  return { success: "Clinic settings updated." };
}
