import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/guards";
import { createDb } from "@/lib/db";
import { ClinicAdminPanel } from "@/components/queue/clinic-admin-panel";

export const instant = false;

export default async function AdminPage() {
  await connection();
  await requireRole("admin");
  const db = createDb();
  const [clinics, doctors, staff] = await Promise.all([
    db.execute(sql`SELECT id, name, timezone FROM public.clinics ORDER BY name, id`),
    db.execute(sql`SELECT d.id, p.full_name AS name, d.clinic_id FROM public.doctors d JOIN public.profiles p ON p.id = d.id ORDER BY p.full_name, d.id`),
    db.execute(sql`SELECT p.id, p.full_name AS name, m.clinic_id FROM public.profiles p LEFT JOIN public.staff_clinic_memberships m ON m.staff_id = p.id WHERE p.role = 'staff' ORDER BY p.full_name, p.id`),
  ]);
  return <ClinicAdminPanel clinics={clinics as unknown as Array<{ id: string; name: string; timezone: string }>}
    doctors={doctors as unknown as Array<{ id: string; name: string; clinic_id: string | null }>}
    staff={staff as unknown as Array<{ id: string; name: string; clinic_id: string | null }>} />;
}
