import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getDoctorAppointmentDetail } from "@/lib/appointments/queries";
import {
  getDoctorActivePatientClinicalRecord,
  getDoctorPatientPrescriptions,
} from "@/lib/clinical/queries";
import { PatientHistoryTabsView } from "@/components/clinical/patient-history-tabs-view";
import type { PatientProfileData } from "@/components/clinical/patient-profile-overview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isUuid } from "@/lib/discovery/directory";

export const instant = false;

export default async function DoctorActivePatientHistoryPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  await connection();
  const account = await requireRole("doctor");
  const { appointmentId } = await params;
  if (!isUuid(appointmentId)) notFound();

  let record = null;
  try {
    record = await getDoctorActivePatientClinicalRecord(appointmentId);
  } catch {
    record = null;
  }

  if (!record?.patient_id) {
    return (
      <div className="mx-auto grid max-w-xl gap-4">
        <h1 className="text-2xl font-semibold">Clinical record unavailable</h1>
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            This patient is neither in active consultation nor recently completed under your account. Return to the queue or appointments to review the current status.
          </CardContent>
        </Card>
        <Button asChild className="justify-self-start">
          <Link href="/doctor/queue">Return to queue</Link>
        </Button>
      </div>
    );
  }

  const supabase = await createClient();

  const [prescriptions, appointmentDetail, doctorDataRes] = await Promise.all([
    getDoctorPatientPrescriptions(appointmentId),
    getDoctorAppointmentDetail(appointmentId).catch(() => null),
    supabase
      .from("doctors")
      .select("specialty, clinic_name, phone")
      .eq("id", account.user.id)
      .maybeSingle(),
  ]);

  const doctorData = doctorDataRes.data;

  const resolvedPatientName =
    record.patient_name?.trim() ||
    appointmentDetail?.patient_name?.trim() ||
    "Patient";

  const patient: PatientProfileData = {
    fullName: resolvedPatientName,
    email: "",
    phone: record.phone ?? null,
    dateOfBirth: record.date_of_birth ?? null,
    patientId: record.patient_id,
  };

  const doctorContext = {
    doctorName: account.profile?.full_name || "Treating Physician",
    doctorSpecialty: doctorData?.specialty ?? undefined,
    clinicName: doctorData?.clinic_name ?? undefined,
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Patient Consultation & Records
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/doctor/queue">Return to queue</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/doctor/appointments">Appointments</Link>
          </Button>
        </div>
      </div>

      {/* Unified Tabbed Clinical Interface (No Metric Cards) */}
      <PatientHistoryTabsView
        patient={patient}
        record={record}
        prescriptions={prescriptions}
        role="doctor"
        appointmentId={appointmentId}
        doctorContext={doctorContext}
      />
    </div>
  );
}
