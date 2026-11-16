import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ClinicAdminPanel } from "@/components/queue/clinic-admin-panel";

export const instant = false;

export default async function AdminPage() {
  await connection();
  await requireRole("admin");
  const supabase = await createClient();
  const [clinics, doctors, staff] = await Promise.all([
    supabase.rpc("admin_clinic_directory"),
    supabase.rpc("admin_doctor_assignments"),
    supabase.rpc("admin_staff_assignments"),
  ]);
  if (clinics.error || doctors.error || staff.error) {
    throw new Error("Admin clinic data could not be loaded. Refresh the page and try again.");
  }
  return <ClinicAdminPanel clinics={clinics.data ?? []} doctors={doctors.data ?? []} staff={staff.data ?? []} />;
}
