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
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Clinic management</h1>
        <p role="alert">Clinic data could not be loaded. Please try again.</p>
        <form action="/admin">
          <button type="submit" className="rounded-md border px-4 py-2">Try again</button>
        </form>
      </main>
    );
  }
  return <ClinicAdminPanel clinics={clinics.data ?? []} doctors={doctors.data ?? []} staff={staff.data ?? []} />;
}
