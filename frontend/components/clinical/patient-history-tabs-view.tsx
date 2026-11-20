"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ClinicalPrescription, ClinicalVisit, PatientClinicalRecord } from "@/lib/clinical/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { parseMedicalDetails } from "@/lib/clinical/vitals";
import { MedicalHistoryForm, type MedicalHistoryEditorSection } from "@/components/clinical/medical-history-form";
import {
  PatientProfileOverview,
  type PatientProfileData,
} from "@/components/clinical/patient-profile-overview";
import {
  Calendar,
  Clock,
  Download,
  HeartPulse,
  History,
  Pencil,
  Pill,
  Stethoscope,
  ChevronRight,
  Plus,
} from "lucide-react";
import { downloadPrescriptionPdf } from "@/lib/clinical/prescription-pdf";
import { DoctorPrescriptionDialog } from "@/components/clinical/doctor-prescription-manager";

type TabKey = "overview" | "visits" | "medications" | "conditions";

function formatDateTime(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDateOnly(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatTimeOnly(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-IN", {
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatFullDateWithDay(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatTimeRange(start: string, end: string, timezone = "UTC") {
  const startTime = formatTimeOnly(start, timezone);
  const endTime = formatTimeOnly(end, timezone);
  return `${startTime} – ${endTime}`;
}

function calculateDurationMinutes(start: string, end: string) {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(diffMs / 60000);
  return mins > 0 ? `${mins} mins` : null;
}

function isMedicationActive(duration: string, publishedAt: string | null): boolean {
  if (!publishedAt) return true;
  const durLower = (duration || "").toLowerCase().trim();
  if (
    durLower.includes("ongoing") ||
    durLower.includes("chronic") ||
    durLower.includes("prn") ||
    durLower.includes("as needed") ||
    durLower.includes("continuous")
  ) {
    return true;
  }

  const pubDate = new Date(publishedAt).getTime();
  if (isNaN(pubDate)) return true;

  let durationDays = 14;

  const dayMatch = durLower.match(/(\d+)\s*day/);
  const weekMatch = durLower.match(/(\d+)\s*week/);
  const monthMatch = durLower.match(/(\d+)\s*month/);

  if (dayMatch) {
    durationDays = parseInt(dayMatch[1], 10);
  } else if (weekMatch) {
    durationDays = parseInt(weekMatch[1], 10) * 7;
  } else if (monthMatch) {
    durationDays = parseInt(monthMatch[1], 10) * 30;
  }

  const expiryDate = pubDate + durationDays * 24 * 60 * 60 * 1000;
  return Date.now() <= expiryDate;
}

export function PatientHistoryTabsView({
  patient,
  record,
  prescriptions,
  initialTab = "overview",
  role = "patient",
  appointmentId,
  doctorContext,
}: {
  patient: PatientProfileData;
  record: PatientClinicalRecord;
  prescriptions: ClinicalPrescription[];
  initialTab?: TabKey | "history" | "profile";
  role?: "patient" | "doctor";
  appointmentId?: string;
  doctorContext?: {
    doctorName: string;
    doctorSpecialty?: string;
    doctorRegistrationNo?: string;
    clinicName?: string;
  };
}) {
  const searchParams = useSearchParams();
  const requestedAction = searchParams?.get("action");
  const requestedTab = searchParams?.get("tab") as TabKey | null;

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (requestedTab && ["overview", "visits", "medications", "conditions"].includes(requestedTab)) {
      return requestedTab;
    }
    return initialTab === "profile" ? "overview" : initialTab === "history" ? "conditions" : initialTab;
  });
  const [editorState, setEditorState] = useState<{
    section: MedicalHistoryEditorSection;
    initialConditionName?: string | null;
  } | null>(null);
  const [conditionFilter, setConditionFilter] = useState<"all" | "active" | "past" | "allergies" | "other">("all");
  const [medicationFilter, setMedicationFilter] = useState<"all" | "active" | "completed">("active");
  const [visitDetailTab, setVisitDetailTab] = useState<"summary" | "prescription">("summary");

  // Local state for prescriptions so doctor modal updates reflect immediately
  const [localPrescriptions, setLocalPrescriptions] = useState<ClinicalPrescription[]>(prescriptions);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(() => {
    return requestedAction === "rx" && Boolean(appointmentId);
  });

  // Default selected appointment to the active appointmentId if present, else first completed visit
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string>(() => {
    if (appointmentId && record.visits.some((v) => v.appointment_id === appointmentId)) {
      return appointmentId;
    }
    return record.visits[0]?.appointment_id ?? appointmentId ?? "";
  });

  const [visitDateFilter, setVisitDateFilter] = useState<string>("");

  const availableVisitDates = useMemo(() => {
    return Array.from(
      new Set(
        record.visits
          .map((v) => (v.slot_start_at ? v.slot_start_at.slice(0, 10) : ""))
          .filter(Boolean),
      ),
    );
  }, [record.visits]);

  const filteredVisits = useMemo(() => {
    if (!visitDateFilter) return record.visits;
    return record.visits.filter(
      (v) => v.slot_start_at && v.slot_start_at.startsWith(visitDateFilter),
    );
  }, [record.visits, visitDateFilter]);

  useEffect(() => {
    if (visitDateFilter && filteredVisits.length > 0) {
      if (!filteredVisits.some((v) => v.appointment_id === selectedAppointmentId)) {
        setSelectedAppointmentId(filteredVisits[0].appointment_id);
      }
    }
  }, [visitDateFilter, filteredVisits, selectedAppointmentId]);

  // Map visits by appointment_id for quick doctor metadata lookup
  const visitsByAppointmentId = useMemo(() => {
    const map = new Map<string, ClinicalVisit>();
    for (const v of record.visits) {
      map.set(v.appointment_id, v);
    }
    return map;
  }, [record.visits]);

  // Map prescriptions by appointmentId for instant O(1) lookup
  const prescriptionsByAppointment = useMemo(() => {
    const map = new Map<string, ClinicalPrescription>();
    for (const rx of localPrescriptions) {
      if (rx.appointment_id) {
        map.set(rx.appointment_id, rx);
      }
    }
    return map;
  }, [localPrescriptions]);

  // Enriched array of all prescribed medications across all visits
  const allMedicationItems = useMemo(() => {
    const list: Array<{
      id: string;
      medication_name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions: string | null;
      published_at: string | null;
      notes: string | null;
      doctor_name: string | null;
      specialty: string | null;
      appointment_id: string;
      isActive: boolean;
    }> = [];

    for (const rx of localPrescriptions) {
      const visit = rx.appointment_id ? visitsByAppointmentId.get(rx.appointment_id) : null;
      for (const item of rx.items ?? []) {
        list.push({
          ...item,
          published_at: rx.published_at,
          notes: rx.notes,
          doctor_name: visit?.doctor_name ?? (rx.appointment_id === appointmentId ? doctorContext?.doctorName ?? null : null),
          specialty: visit?.specialty ?? (rx.appointment_id === appointmentId ? doctorContext?.doctorSpecialty ?? null : null),
          appointment_id: rx.appointment_id,
          isActive: isMedicationActive(item.duration, rx.published_at),
        });
      }
    }
    return list;
  }, [localPrescriptions, visitsByAppointmentId, appointmentId, doctorContext]);

  const activeMedicationsCount = useMemo(
    () => allMedicationItems.filter((m) => m.isActive).length,
    [allMedicationItems],
  );

  const completedMedicationsCount = useMemo(
    () => allMedicationItems.filter((m) => !m.isActive).length,
    [allMedicationItems],
  );

  const filteredMedications = useMemo(() => {
    if (medicationFilter === "active") {
      return allMedicationItems.filter((m) => m.isActive);
    }
    if (medicationFilter === "completed") {
      return allMedicationItems.filter((m) => !m.isActive);
    }
    return allMedicationItems;
  }, [allMedicationItems, medicationFilter]);

  // Active visit for the master-detail pane
  const activeVisit = useMemo(() => {
    if (!selectedAppointmentId) return record.visits[0] ?? null;
    return record.visits.find((v) => v.appointment_id === selectedAppointmentId) ?? record.visits[0] ?? null;
  }, [record.visits, selectedAppointmentId]);

  const activePrescription = activeVisit
    ? prescriptionsByAppointment.get(activeVisit.appointment_id) ?? null
    : appointmentId
      ? prescriptionsByAppointment.get(appointmentId) ?? null
      : null;

  const activeAppointmentPrescription = appointmentId
    ? prescriptionsByAppointment.get(appointmentId) ?? null
    : null;

  const allergyItems = record.medical_history?.allergies?.items ?? [];
  const allergyStatus = record.medical_history?.allergies?.status ?? "unknown";

  const conditionsList = record.medical_history?.conditions?.items ?? [];
  const healthProfile = parseMedicalDetails(record.medical_history?.medical_details).healthProfile;
  const conditionRows = [
    ...conditionsList.map((item) => ({ key: `condition-${item.name}-${item.status}`, type: item.status === "active" ? "Chronic condition" : "Past condition", filter: item.status === "active" ? "active" : "past", item: item.name, status: item.status === "active" ? "Active" : "Past", details: item.notes || "—", section: "conditions" as MedicalHistoryEditorSection })),
    ...allergyItems.map((item) => ({ key: `allergy-${item.substance}`, type: "Allergy", filter: "allergies", item: item.substance, status: item.severity, details: item.reaction || "Reaction not added", section: "allergies" as MedicalHistoryEditorSection })),
    ...healthProfile.currentConcerns.map((item, index) => ({ key: `concern-${index}-${item.description}`, type: "Current concern", filter: "other", item: item.description, status: "Active", details: item.onset ? `Since ${item.onset}` : "Reported concern", section: "concerns" as MedicalHistoryEditorSection })),
    ...healthProfile.pastSurgeries.map((item, index) => ({ key: `surgery-${index}-${item.procedure}`, type: "Past surgery", filter: "other", item: item.procedure, status: "Reported", details: [item.approximateDate, item.notes].filter(Boolean).join(" · ") || "—", section: "surgeries" as MedicalHistoryEditorSection })),
  ].filter((row) => conditionFilter === "all" || row.filter === conditionFilter);

  const openEditor = (section: MedicalHistoryEditorSection, initialConditionName?: string | null) => {
    setEditorState({ section, initialConditionName });
  };
  const editorCopy: Record<MedicalHistoryEditorSection, { title: string; description: string }> = {
    personal: { title: "Personal & biometric details", description: "Update personal health measurements and contact info." },
    conditions: { title: "Health conditions", description: "Review and record known health conditions." },
    allergies: { title: "Allergies & reactions", description: "Record allergies and adverse reactions." },
    concerns: { title: "Current concerns", description: "Document active symptoms or concerns." },
    surgeries: { title: "Past surgeries & operations", description: "Record previous surgeries and procedures." },
    medications: { title: "Medications & supplements", description: "Record regular medications and supplements." },
    all: { title: "Medical profile", description: "Update medical profile details." },
  };

  const handleDownloadPrescription = (rx: ClinicalPrescription, visit?: ClinicalVisit | null) => {
    const visitDoctor = visit ? visit.doctor_name : doctorContext?.doctorName || "Treating Physician";
    const visitClinic = visit ? visit.clinic_name : doctorContext?.clinicName || "Schedula Healthcare Clinic";
    const visitSpecialty = visit ? visit.specialty : doctorContext?.doctorSpecialty || "General Medicine";
    const consultDate = visit?.slot_start_at
      ? formatDateTime(visit.slot_start_at, visit.timezone)
      : rx.published_at
        ? formatDateTime(rx.published_at)
        : "Recent Consultation";

    const allergiesDisplay =
      allergyItems.length > 0
        ? allergyItems.map((a) => `${a.substance} (${a.severity})`).join(", ")
        : allergyStatus === "none_known"
          ? "No known drug allergies"
          : "None recorded";

    downloadPrescriptionPdf({
      prescription: rx,
      clinicName: visitClinic,
      doctorName: visitDoctor,
      doctorSpecialty: visitSpecialty,
      doctorRegistrationNo: doctorContext?.doctorRegistrationNo || "REG-IN-2024-8192",
      patientName: patient.fullName,
      patientDob: patient.dateOfBirth ?? undefined,
      patientPhone: patient.phone ?? undefined,
      consultationDate: consultDate,
      allergies: allergiesDisplay,
    });
  };

  return (
    <div className="space-y-6">
      {/* 4-Tab Navigation & Header Actions (Sticky Header) */}
      <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3 pt-2">
        <div className="overflow-x-auto pb-1 sm:pb-0">
          <div
            className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 w-max sm:w-fit"
            role="tablist"
            aria-label="Medical records sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                activeTab === "overview"
                  ? "bg-white dark:bg-card text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-200 dark:ring-sky-900/50 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Stethoscope className="size-4 text-sky-600 dark:text-sky-400" />
              <span>Medical Profile</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "visits"}
              onClick={() => setActiveTab("visits")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                activeTab === "visits"
                  ? "bg-white dark:bg-card text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-200 dark:ring-sky-900/50 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <History className="size-4 text-sky-600 dark:text-sky-400" />
              <span>{role === "doctor" ? "Completed Visits" : "Past Consultations"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.2 text-[11px] font-bold",
                  activeTab === "visits"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {record.visits.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "medications"}
              onClick={() => setActiveTab("medications")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                activeTab === "medications"
                  ? "bg-white dark:bg-card text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-200 dark:ring-sky-900/50 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pill className="size-4 text-sky-600 dark:text-sky-400" />
              <span>Medications</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.2 text-[11px] font-bold",
                  activeTab === "medications"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {activeMedicationsCount > 0 ? activeMedicationsCount : allMedicationItems.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "conditions"}
              onClick={() => setActiveTab("conditions")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                activeTab === "conditions"
                  ? "bg-white dark:bg-card text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-200 dark:ring-sky-900/50 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HeartPulse className="size-4 text-sky-600 dark:text-sky-400" />
              <span>Illnesses & Conditions</span>
            </button>
          </div>
        </div>

        {/* Doctor Header CTA: Issue / Update Prescription */}
        {role === "doctor" && appointmentId ? (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {activeAppointmentPrescription && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDownloadPrescription(activeAppointmentPrescription, activeVisit)}
                className="h-9 px-3 text-xs gap-1.5 rounded-xl border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold shadow-xs"
                title="Download official printed prescription PDF"
              >
                <Download className="size-3.5" />
                <span>Download Prescription</span>
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={() => setIsPrescriptionModalOpen(true)}
              className={cn(
                "rounded-xl font-semibold shadow-xs gap-1.5 text-xs h-8 px-3.5 text-white transition-all",
                activeAppointmentPrescription
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-sky-600 hover:bg-sky-700",
              )}
            >
              {activeAppointmentPrescription ? (
                <>
                  <Pencil className="size-3.5" />
                  <span>Update Prescription</span>
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  <span>Issue Prescription</span>
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MEDICAL OVERVIEW (Clinical Identity & Core Biometrics)             */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <PatientProfileOverview
          patient={patient}
          record={record}
          onEditPersonal={() => openEditor("personal")}
          onAddCondition={() => openEditor("conditions")}
          role={role}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 2: COMPLETED VISITS / PAST CONSULTATIONS (Master-Detail Pane)        */}
      {/* ========================================================================= */}
      {activeTab === "visits" && (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* Left Pane: Consultations Directory (5 cols) */}
          <div className="space-y-3 lg:col-span-5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-foreground">
                {role === "doctor" ? "All Consultations" : "All Past Consultations"}
              </h3>
              <span className="text-xs text-muted-foreground">
                {filteredVisits.length} of {record.visits.length}
              </span>
            </div>

            {/* Receptionist-Style Custom Calendar Date Filter */}
            {record.visits.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CustomDatePicker
                    name="visit-date-filter"
                    value={visitDateFilter}
                    onChange={(date) => setVisitDateFilter(date)}
                    availableDates={availableVisitDates}
                    allowPastDates={true}
                    placeholder="Filter by date (All consultations)"
                    className="h-9 rounded-xl text-xs font-medium"
                  />
                </div>
                {visitDateFilter && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisitDateFilter("")}
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 rounded-xl"
                    title="Show all consultation dates"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {filteredVisits.length === 0 ? (
              <Card className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
                <Calendar className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {visitDateFilter ? "No visits on this date" : "No completed visits"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {visitDateFilter
                    ? `No consultations found for ${formatDateOnly(visitDateFilter)}. Choose another date or clear filter.`
                    : "Completed visits and doctor consultation records will appear here."}
                </p>
                {visitDateFilter && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisitDateFilter("")}
                    className="mt-3 rounded-xl text-xs font-semibold"
                  >
                    Show all consultations
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1.5 [scrollbar-width:none] hover:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden hover:[&::-webkit-scrollbar]:block transition-all">
                {filteredVisits.map((visit) => {
                  const isSelected = activeVisit?.appointment_id === visit.appointment_id;
                  const rx = prescriptionsByAppointment.get(visit.appointment_id);
                  const itemCount = rx?.items?.length ?? 0;

                  return (
                    <button
                      key={visit.appointment_id}
                      type="button"
                      onClick={() => setSelectedAppointmentId(visit.appointment_id)}
                      className={cn(
                        "w-full text-left rounded-2xl border p-3.5 transition-all text-xs sm:text-sm",
                        isSelected
                          ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 shadow-xs ring-1 ring-sky-300"
                          : "border-border bg-card hover:bg-muted/30 hover:border-border/80",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div>
                          <p className={cn("font-bold", isSelected ? "text-[#1D2153] dark:text-white" : "text-foreground")}>
                            {visit.doctor_name || "Consultation"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {visit.specialty}
                          </p>
                        </div>

                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 transition-transform",
                            isSelected ? "text-sky-600 translate-x-0.5" : "text-muted-foreground/50",
                          )}
                        />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar className="size-3 text-sky-600" />
                          {visit.slot_start_at ? formatDateOnly(visit.slot_start_at, visit.timezone) : "Completed"}
                        </span>

                        {visit.slot_start_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTimeOnly(visit.slot_start_at, visit.timezone)}
                          </span>
                        )}

                        {itemCount > 0 && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            <Pill className="size-3" />
                            {itemCount} {itemCount === 1 ? "med" : "meds"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Pane: Visit Details & Prescription (7 cols) */}
          <div className="space-y-4 lg:col-span-7">
            {activeVisit ? (
              <Card className="rounded-2xl border bg-card shadow-xs overflow-hidden flex flex-col max-h-[640px] xl:max-h-[calc(100vh-240px)]">
                {/* Consultation Record Header */}
                <div className="shrink-0 border-b bg-muted/20 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h4 className="text-base sm:text-lg font-bold text-[#1D2153] dark:text-white">
                          {activeVisit.slot_start_at
                            ? formatFullDateWithDay(activeVisit.slot_start_at, activeVisit.timezone)
                            : "Consultation Record"}
                        </h4>
                      </div>

                      {/* Schedule: Start Time – End Time, Duration, Timezone */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        {activeVisit.slot_start_at && (
                          <span className="flex items-center gap-1.5 font-semibold text-foreground">
                            <Clock className="size-3.5 text-sky-600 dark:text-sky-400" />
                            <span>
                              {activeVisit.slot_end_at
                                ? formatTimeRange(activeVisit.slot_start_at, activeVisit.slot_end_at, activeVisit.timezone)
                                : formatTimeOnly(activeVisit.slot_start_at, activeVisit.timezone)}
                            </span>
                            {activeVisit.slot_end_at && (
                              <span className="font-normal text-muted-foreground">
                                ({calculateDurationMinutes(activeVisit.slot_start_at, activeVisit.slot_end_at)})
                              </span>
                            )}
                          </span>
                        )}

                        <span className="text-border">·</span>

                        {/* Attending Doctor & Clinic Metadata */}
                        <span className="flex items-center gap-1.5">
                          <Stethoscope className="size-3.5 text-sky-600 dark:text-sky-400" />
                          <span className="font-medium text-foreground">{activeVisit.doctor_name}</span>
                          <span>({activeVisit.specialty})</span>
                          <span>·</span>
                          <span>{activeVisit.clinic_name}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-start">
                      {activePrescription && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPrescription(activePrescription, activeVisit)}
                          className="h-8 gap-1.5 rounded-xl text-xs font-semibold border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                        >
                          <Download className="size-3.5" />
                          <span>Download Prescription</span>
                        </Button>
                      )}

                      {role === "doctor" && activeVisit.appointment_id === appointmentId && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setIsPrescriptionModalOpen(true)}
                          className="h-8 gap-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white"
                        >
                          <Pencil className="size-3.5" />
                          <span>{activePrescription ? "Edit Prescription" : "Add Prescription"}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subtabs for Summary vs Prescription */}
                <div className="shrink-0 border-b px-5 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisitDetailTab("summary")}
                      className={cn(
                        "border-b-2 py-2 px-1 text-xs font-semibold transition-all",
                        visitDetailTab === "summary"
                          ? "border-sky-600 text-sky-700 dark:text-sky-300 font-bold"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Consultation Summary
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisitDetailTab("prescription")}
                      className={cn(
                        "border-b-2 py-2 px-1 text-xs font-semibold transition-all flex items-center gap-1.5",
                        visitDetailTab === "prescription"
                          ? "border-sky-600 text-sky-700 dark:text-sky-300 font-bold"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span>Prescription</span>
                      {activePrescription && (
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Subtab Content with Internal Scroll */}
                <CardContent className="p-5 sm:p-6 text-xs sm:text-sm overflow-y-auto flex-1">
                  {visitDetailTab === "summary" && (
                    <div className="space-y-4">
                      {activeVisit.summary ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Doctor Notes & Clinical Summary
                          </p>
                          <div className="rounded-xl border bg-muted/15 p-4 text-xs leading-relaxed text-foreground whitespace-pre-line">
                            {activeVisit.summary}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">
                          No written consultation summary was recorded for this visit.
                        </div>
                      )}
                    </div>
                  )}

                  {visitDetailTab === "prescription" && (
                    <div className="space-y-4">
                      {activePrescription ? (
                        <div className="space-y-4">
                          {activePrescription.notes && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                                Clinical Notes & Directions
                              </p>
                              <p className="mt-1 text-xs text-foreground whitespace-pre-line font-medium">
                                {activePrescription.notes}
                              </p>
                            </div>
                          )}

                          <div className="space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Pill className="size-3.5 text-emerald-600" />
                              <span>Prescribed Medicines ({activePrescription.items.length})</span>
                            </p>

                            <div className="overflow-x-auto rounded-xl border">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="border-b bg-muted/40 font-bold text-muted-foreground">
                                    <th className="p-2.5">Medicine</th>
                                    <th className="p-2.5">Dosage</th>
                                    <th className="p-2.5">Frequency</th>
                                    <th className="p-2.5">Duration</th>
                                    <th className="p-2.5">Instructions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activePrescription.items.map((item, idx) => (
                                    <tr key={`${item.id}-${idx}`} className="border-b last:border-0 hover:bg-muted/15">
                                      <td className="p-2.5 font-bold text-[#1D2153] dark:text-white">
                                        {item.medication_name}
                                      </td>
                                      <td className="p-2.5 font-medium">{item.dosage}</td>
                                      <td className="p-2.5 font-medium text-foreground">{item.frequency}</td>
                                      <td className="p-2.5 text-muted-foreground">{item.duration}</td>
                                      <td className="p-2.5 text-muted-foreground italic">
                                        {item.instructions || "As directed"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-sky-300 dark:border-sky-800 bg-sky-50/20 dark:bg-sky-950/10 p-6 text-center space-y-2">
                          <Pill className="mx-auto size-7 text-sky-600 dark:text-sky-400" />
                          <p className="text-sm font-bold text-foreground">No prescription on file for this consultation</p>
                          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                            {role === "doctor"
                              ? "You can issue an official digital prescription with structured medications and instructions."
                              : "No digital medications were prescribed during this consultation."}
                          </p>
                          {role === "doctor" && activeVisit.appointment_id === appointmentId && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setIsPrescriptionModalOpen(true)}
                              className="mt-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs gap-1.5"
                            >
                              <Plus className="size-4" />
                              <span>Issue Prescription</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center text-xs text-muted-foreground">
                Select a completed consultation on the left to view clinician notes and prescription details.
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MEDICATIONS (Structured Regimens & History)                        */}
      {/* ========================================================================= */}
      {activeTab === "medications" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1D2153] dark:text-white">Prescribed Medications</h2>
              <p className="text-xs text-muted-foreground">
                Active regimens and completed medication courses from consultations.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 text-xs">
                <button
                  type="button"
                  onClick={() => setMedicationFilter("active")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 font-semibold transition-all text-xs",
                    medicationFilter === "active"
                      ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Currently Taking ({activeMedicationsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMedicationFilter("all")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 font-semibold transition-all text-xs",
                    medicationFilter === "all"
                      ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  All ({allMedicationItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMedicationFilter("completed")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 font-semibold transition-all text-xs",
                    medicationFilter === "completed"
                      ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Completed ({completedMedicationsCount})
                </button>
              </div>

              {role !== "doctor" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openEditor("medications")}
                  className="rounded-xl font-semibold text-xs gap-1.5 h-8 bg-sky-600 hover:bg-sky-700 text-white shadow-xs border-0"
                >
                  <Plus className="size-3.5" />
                  <span>Add Medication</span>
                </Button>
              )}
            </div>
          </div>

          {filteredMedications.length === 0 ? (
            <Card className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center text-xs text-muted-foreground">
              <Pill className="mx-auto size-7 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold text-foreground">No medications in this view</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {medicationFilter === "active"
                  ? "No medications currently marked as active. Switch to 'All' to review previous prescriptions."
                  : "Prescriptions issued during consultations will appear here automatically."}
              </p>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-bold text-[#1D2153] dark:text-white">Medication & Strength</TableHead>
                    <TableHead className="font-bold text-[#1D2153] dark:text-white">Start Date</TableHead>
                    <TableHead className="font-bold text-[#1D2153] dark:text-white">Regimen</TableHead>
                    <TableHead className="font-bold text-[#1D2153] dark:text-white">Duration</TableHead>
                    <TableHead className="font-bold text-[#1D2153] dark:text-white">Instructions</TableHead>
                    <TableHead className="font-bold text-[#1D2153] dark:text-white">Prescribed By</TableHead>
                    <TableHead className="text-right font-bold text-[#1D2153] dark:text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMedications.map((med, index) => (
                    <TableRow key={`${med.id}-${index}`} className="hover:bg-muted/20 text-xs">
                      {/* Medication & Strength */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg",
                              med.isActive
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Pill className="size-4" />
                          </div>
                          <div>
                            <p className="font-bold text-[#1D2153] dark:text-white text-xs sm:text-sm">
                              {med.medication_name}
                            </p>
                            <span className="text-[11px] text-muted-foreground font-semibold">{med.dosage}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Start Date */}
                      <TableCell className="text-xs whitespace-nowrap font-medium text-foreground">
                        {med.published_at
                          ? formatDateOnly(med.published_at, visitsByAppointmentId.get(med.appointment_id)?.timezone)
                          : visitsByAppointmentId.get(med.appointment_id)?.slot_start_at
                            ? formatDateOnly(visitsByAppointmentId.get(med.appointment_id)!.slot_start_at, visitsByAppointmentId.get(med.appointment_id)?.timezone)
                            : "—"}
                      </TableCell>

                      {/* Regimen */}
                      <TableCell className="text-xs">
                        <span className="font-semibold text-foreground">{med.frequency}</span>
                      </TableCell>

                      {/* Duration */}
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {med.duration}
                      </TableCell>

                      {/* Instructions */}
                      <TableCell className="text-xs text-muted-foreground italic">
                        {med.instructions || "—"}
                      </TableCell>

                      {/* Prescribed By */}
                      <TableCell className="text-xs">
                        <p className="font-semibold text-foreground">{med.doctor_name || "Treating Physician"}</p>
                        <span className="text-[11px] text-muted-foreground">{med.specialty || "Clinic"}</span>
                      </TableCell>

                      {/* Action: Download PDF */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const rx = prescriptionsByAppointment.get(med.appointment_id);
                              const visit = visitsByAppointmentId.get(med.appointment_id);
                              if (rx) handleDownloadPrescription(rx, visit);
                            }}
                            className="h-7.5 px-2 text-xs gap-1 rounded-lg border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold"
                            title="Download official printed prescription PDF"
                          >
                            <Download className="size-3" />
                            <span className="hidden sm:inline">PDF</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedAppointmentId(med.appointment_id);
                              setActiveTab("visits");
                              setVisitDetailTab("prescription");
                            }}
                            className="h-7.5 gap-1 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400"
                          >
                            <span>Visit</span>
                            <ChevronRight className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: ILLNESSES & CONDITIONS                                             */}
      {/* ========================================================================= */}
      {activeTab === "conditions" && (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#1D2153] dark:text-white">Illnesses & Conditions</h2>
                <p className="text-xs text-muted-foreground">Recorded medical profile details.</p>
              </div>
              {role !== "doctor" && (
                <Button type="button" variant="outline" size="sm" onClick={() => openEditor("conditions")}>
                  <Plus className="size-3.5" /> Add health item
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter illnesses and conditions">
              {(["all", "active", "past", "allergies", "other"] as const).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={conditionFilter === filter ? "default" : "outline"}
                  onClick={() => setConditionFilter(filter)}
                  className="capitalize text-xs"
                >
                  {filter === "other" ? "Other health history" : filter}
                </Button>
              ))}
            </div>

            {conditionRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                No items in this view yet.
                {role !== "doctor" && (
                  <>
                    {" "}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => openEditor(conditionFilter === "allergies" ? "allergies" : conditionFilter === "other" ? "concerns" : "conditions")}
                    >
                      Add an item
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                      {role !== "doctor" && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conditionRows.map((row) => (
                      <TableRow key={row.key} className="text-xs">
                        <TableCell className="font-medium text-muted-foreground">{row.type}</TableCell>
                        <TableCell className="font-bold text-[#1D2153] dark:text-white">{row.item}</TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                        <TableCell>{row.details}</TableCell>
                        {role !== "doctor" && (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditor(row.section, row.section === "conditions" ? row.item : null)}
                            >
                              Update
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT PROFILE / CONDITIONS MODAL DIALOG                                    */}
      {/* ========================================================================= */}
      <Dialog open={editorState !== null} onOpenChange={(open) => { if (!open) setEditorState(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editorState?.section === "conditions" ? (
                <HeartPulse className="size-5 text-sky-600 dark:text-sky-400" />
              ) : (
                <Pencil className="size-5 text-sky-600 dark:text-sky-400" />
              )}
              <span>
                {editorState?.section === "conditions"
                  ? editorState.initialConditionName
                    ? "Update Health Condition"
                    : "Add Health Condition"
                  : editorState?.section
                    ? editorCopy[editorState.section].title
                    : "Medical Profile"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {editorState?.section === "conditions"
                ? editorState.initialConditionName
                  ? `Update details or treatment notes for ${editorState.initialConditionName}.`
                  : "Record a diagnosed or chronic health condition in your medical profile."
                : editorState?.section
                  ? editorCopy[editorState.section].description
                  : "Update health profile details."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <MedicalHistoryForm
              patientId={patient.patientId}
              history={record.medical_history}
              editor={role === "doctor" ? "doctor" : "patient"}
              section={editorState?.section ?? "all"}
              initialConditionName={editorState?.initialConditionName}
              pastConsultations={record.visits}
              prescriptions={localPrescriptions}
              onCancel={() => setEditorState(null)}
              onSaved={() => setEditorState(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DOCTOR PRESCRIPTION MODAL DIALOG                                          */}
      {/* ========================================================================= */}
      {role === "doctor" && appointmentId && (
        <DoctorPrescriptionDialog
          open={isPrescriptionModalOpen}
          onOpenChange={setIsPrescriptionModalOpen}
          appointmentId={appointmentId}
          patientName={patient.fullName}
          patientDob={patient.dateOfBirth ?? undefined}
          patientPhone={patient.phone ?? undefined}
          allergiesText={
            allergyItems.length > 0
              ? allergyItems.map((a) => `${a.substance} (${a.severity})`).join(", ")
              : allergyStatus === "none_known"
                ? "No known drug allergies"
                : undefined
          }
          doctorName={doctorContext?.doctorName || "Treating Physician"}
          doctorSpecialty={doctorContext?.doctorSpecialty}
          doctorRegistrationNo={doctorContext?.doctorRegistrationNo}
          clinicName={doctorContext?.clinicName}
          initialPrescription={activeAppointmentPrescription}
          onPrescriptionSaved={(newRx) => {
            setLocalPrescriptions((prev) => {
              const existingIdx = prev.findIndex((p) => p.appointment_id === newRx.appointment_id);
              if (existingIdx >= 0) {
                const copy = [...prev];
                copy[existingIdx] = newRx;
                return copy;
              }
              return [newRx, ...prev];
            });
          }}
        />
      )}
    </div>
  );
}
