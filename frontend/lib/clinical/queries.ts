import { createClient } from "@/lib/supabase/server";

export type ClinicalMedicalHistory = {
  id?: string;
  version: number;
  allergies: { status: "unknown" | "none_known" | "recorded"; items: Array<{ substance: string; reaction: string; severity: "unknown" | "mild" | "moderate" | "severe" }> };
  conditions: { items: Array<{ name: string; status: "active" | "resolved"; notes: string }> };
  medical_details: string | null;
  source: "patient_reported" | "doctor_recorded";
  verification_status: "self_reported" | "clinician_verified";
  authored_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
};

export type ClinicalVisit = {
  appointment_id: string;
  completed_at: string;
  doctor_name: string;
  specialty: string;
  clinic_name: string;
  timezone: string;
  slot_start_at: string;
  slot_end_at: string;
  appointment_status: "completed";
  summary: string | null;
  summary_status: "draft" | "published" | null;
  published_at: string | null;
};

export type PatientClinicalRecord = {
  patient_id?: string;
  patient_name?: string;
  date_of_birth?: string | null;
  phone?: string | null;
  medical_history: ClinicalMedicalHistory | null;
  medical_history_revisions: ClinicalMedicalHistory[];
  visits: ClinicalVisit[];
};

export type DoctorVisitSummary = {
  version: number;
  summary: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
};

export type ClinicalPrescriptionItem = {
  id: string;
  prescription_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  sort_order: number;
};

export type ClinicalPrescription = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  status: "draft" | "published";
  notes: string | null;
  published_at: string | null;
  created_at: string;
  items: ClinicalPrescriptionItem[];
};

type RawPrescriptionRow = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  status: "draft" | "published";
  notes: string | null;
  published_at: string | null;
  created_at: string;
  items: ClinicalPrescriptionItem[] | null;
};

export async function getPatientPrescriptions(patientId: string): Promise<ClinicalPrescription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      id,
      appointment_id,
      doctor_id,
      patient_id,
      status,
      notes,
      published_at,
      created_at,
      items:prescription_items (
        id,
        prescription_id,
        medication_name,
        dosage,
        frequency,
        duration,
        instructions,
        sort_order
      )
    `)
    .eq("patient_id", patientId)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Prescriptions query error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as RawPrescriptionRow[];
  return rows.map((rx) => ({
    ...rx,
    items: ((rx.items ?? []) as ClinicalPrescriptionItem[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));
}
export async function getPatientClinicalRecord(patientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("patient_clinical_record", { p_patient_id: patientId });
  if (error) throw new Error(`Clinical record query failed: ${error.message}`);
  return data as PatientClinicalRecord;
}

export async function getDoctorActivePatientClinicalRecord(appointmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_active_patient_clinical_record", { p_appointment_id: appointmentId });
  if (error) throw new Error(`Active clinical record query failed: ${error.message}`);
  return data as PatientClinicalRecord;
}

export async function getDoctorVisitSummary(appointmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_visit_summary", { p_appointment_id: appointmentId });
  if (error) throw new Error(`Visit summary query failed: ${error.message}`);
  return ((data ?? []) as DoctorVisitSummary[])[0] ?? null;
}

export async function getDoctorAppointmentPrescription(appointmentId: string): Promise<ClinicalPrescription | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      id,
      appointment_id,
      doctor_id,
      patient_id,
      status,
      notes,
      published_at,
      created_at,
      items:prescription_items (
        id,
        prescription_id,
        medication_name,
        dosage,
        frequency,
        duration,
        instructions,
        sort_order
      )
    `)
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const rx = data as unknown as RawPrescriptionRow;
  return {
    ...rx,
    items: ((rx.items ?? []) as ClinicalPrescriptionItem[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  };
}

export async function getDoctorPatientPrescriptions(appointmentId: string): Promise<ClinicalPrescription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_active_patient_prescriptions", {
    p_appointment_id: appointmentId,
  });

  if (error) {
    // Graceful fallback to single appointment prescription query
    const single = await getDoctorAppointmentPrescription(appointmentId);
    return single ? [single] : [];
  }

  const rows = (data ?? []) as unknown as RawPrescriptionRow[];
  return rows.map((rx) => ({
    ...rx,
    items: ((rx.items ?? []) as ClinicalPrescriptionItem[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));
}
