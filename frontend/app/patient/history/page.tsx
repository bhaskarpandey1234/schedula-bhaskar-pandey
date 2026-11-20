import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getPatientClinicalRecord, getPatientPrescriptions } from "@/lib/clinical/queries";
import { PatientHistoryTabsView } from "@/components/clinical/patient-history-tabs-view";
import type { PatientProfileData } from "@/components/clinical/patient-profile-overview";

export const instant = false;

export default async function PatientHistoryPage() {
  await connection();
  const account = await requireRole("patient");
  const supabase = await createClient();

  const [record, prescriptions, patientDataRes] = await Promise.all([
    getPatientClinicalRecord(account.user.id),
    getPatientPrescriptions(account.user.id),
    supabase
      .from("patients")
      .select("phone, date_of_birth")
      .eq("id", account.user.id)
      .maybeSingle(),
  ]);

  const patientRow = patientDataRes.data;

  const patient: PatientProfileData = {
    fullName: account.profile?.full_name || "Patient",
    email: account.user.email || "",
    phone: patientRow?.phone ?? null,
    dateOfBirth: patientRow?.date_of_birth ?? null,
    patientId: account.user.id,
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PatientHistoryTabsView
        patient={patient}
        record={record}
        prescriptions={prescriptions}
      />
    </div>
  );
}
