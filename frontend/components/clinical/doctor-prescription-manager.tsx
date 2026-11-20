"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { publishPrescriptionAction, type ClinicalActionState } from "@/lib/clinical/actions";
import type { ClinicalPrescription } from "@/lib/clinical/queries";
import { downloadPrescriptionPdf } from "@/lib/clinical/prescription-pdf";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Pencil,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
} from "lucide-react";

export type PrescriptionItemForm = {
  id?: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

const COMMON_MEDICATIONS = [
  "Paracetamol 650mg",
  "Amoxicillin & Clavulanate 625mg",
  "Azithromycin 500mg",
  "Pantoprazole 40mg",
  "Cetirizine 10mg",
  "Montelukast & Levocetirizine",
  "Metformin 500mg",
  "Telmisartan 40mg",
  "Atorvastatin 10mg",
  "Ibuprofen 400mg",
  "ORS Sachet",
  "Budesonide Inhaler",
];

const COMMON_DOSAGES = [
  "1 Tablet",
  "2 Tablets",
  "1 Capsule",
  "5 ml",
  "10 ml",
  "1 Puff",
  "1 Sachet",
  "1 Drop",
  "500 mg",
  "650 mg",
];

const COMMON_FREQUENCIES = [
  { label: "1-0-1 (Twice daily)", code: "1-0-1" },
  { label: "1-0-0 (Morning)", code: "1-0-0" },
  { label: "0-0-1 (Night)", code: "0-0-1" },
  { label: "1-1-1 (Thrice daily)", code: "1-1-1" },
  { label: "1-1-1-1 (4 times a day)", code: "1-1-1-1" },
  { label: "SOS (As needed)", code: "SOS" },
];

const COMMON_DURATIONS = [
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "1 month",
  "Ongoing",
  "SOS",
];

const COMMON_INSTRUCTIONS = [
  "After food with water",
  "Before food on empty stomach",
  "Take with meals",
  "At bedtime",
  "With warm water",
  "Complete full course",
  "As directed by physician",
];

export function DoctorPrescriptionManager({
  appointmentId,
  patientName,
  patientGender,
  patientDob,
  patientPhone,
  allergiesText,
  doctorName,
  doctorSpecialty,
  doctorRegistrationNo,
  clinicName,
  initialPrescription = null,
  onPrescriptionSaved,
  onCancel,
  isModal = false,
}: {
  appointmentId: string;
  patientName: string;
  patientGender?: string;
  patientDob?: string;
  patientPhone?: string;
  allergiesText?: string;
  doctorName: string;
  doctorSpecialty?: string;
  doctorRegistrationNo?: string;
  clinicName?: string;
  initialPrescription?: ClinicalPrescription | null;
  onPrescriptionSaved?: (newRx: ClinicalPrescription) => void;
  onCancel?: () => void;
  isModal?: boolean;
}) {
  const [existingPrescription, setExistingPrescription] = useState<ClinicalPrescription | null>(
    initialPrescription,
  );
  const [isEditing, setIsEditing] = useState(isModal || !initialPrescription);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form states
  const [diagnosis, setDiagnosis] = useState(() => {
    if (!initialPrescription?.notes) return "";
    const match = initialPrescription.notes.match(/^Diagnosis:\s*([^\n]+)/i);
    return match ? match[1].trim() : "";
  });

  const [notes, setNotes] = useState(() => {
    if (!initialPrescription?.notes) return "";
    return initialPrescription.notes.replace(/^Diagnosis:\s*[^\n]+\n*/i, "").trim();
  });

  const [items, setItems] = useState<PrescriptionItemForm[]>(() => {
    if (initialPrescription?.items && initialPrescription.items.length > 0) {
      return initialPrescription.items.map((it) => ({
        id: it.id,
        medicationName: it.medication_name,
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        instructions: it.instructions || "",
      }));
    }
    return [];
  });

  useEffect(() => {
    setExistingPrescription(initialPrescription ?? null);
    if (isModal) {
      setIsEditing(true);
    } else {
      setIsEditing(!initialPrescription);
    }
    if (initialPrescription) {
      const match = initialPrescription.notes?.match(/^Diagnosis:\s*([^\n]+)/i);
      setDiagnosis(match ? match[1].trim() : "");
      setNotes(initialPrescription.notes ? initialPrescription.notes.replace(/^Diagnosis:\s*[^\n]+\n*/i, "").trim() : "");
      if (initialPrescription.items && initialPrescription.items.length > 0) {
        setItems(
          initialPrescription.items.map((it) => ({
            id: it.id,
            medicationName: it.medication_name,
            dosage: it.dosage,
            frequency: it.frequency,
            duration: it.duration,
            instructions: it.instructions || "",
          })),
        );
      } else {
        setItems([]);
      }
    } else {
      setDiagnosis("");
      setNotes("");
      setItems([]);
    }
  }, [initialPrescription, isModal]);

  const [state, formAction, isPending] = useActionState(publishPrescriptionAction, {} as ClinicalActionState);
  const [isDownloading, startDownloadTransition] = useTransition();
  const handledSuccessRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.success) {
      const submissionKey = state.prescriptionId || "success";
      if (handledSuccessRef.current === submissionKey) return;
      handledSuccessRef.current = submissionKey;

      const newRx: ClinicalPrescription = {
        id: state.prescriptionId || existingPrescription?.id || "RX-UPDATED",
        appointment_id: appointmentId,
        doctor_id: "DOC",
        patient_id: "PAT",
        status: "published",
        notes: [diagnosis ? `Diagnosis: ${diagnosis}` : "", notes].filter(Boolean).join("\n\n"),
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        items: items.map((it, idx) => ({
          id: String(idx),
          prescription_id: state.prescriptionId || "RX-UPDATED",
          medication_name: it.medicationName,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          instructions: it.instructions || null,
          sort_order: idx,
        })),
      };
      setExistingPrescription(newRx);
      setIsEditing(false);
      setIsPreviewOpen(false);
      onPrescriptionSaved?.(newRx);
    }
  }, [state.success, state.prescriptionId, appointmentId, diagnosis, notes, items, existingPrescription?.id, onPrescriptionSaved]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        medicationName: "",
        dosage: "",
        frequency: "",
        duration: "",
        instructions: "",
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setFieldErrors((prev) => {
      const copy: Record<string, string> = {};
      Object.entries(prev).forEach(([key, val]) => {
        if (!key.startsWith(`item-${index}-`)) {
          copy[key] = val;
        }
      });
      return copy;
    });
  };

  const handleItemChange = (index: number, field: keyof PrescriptionItemForm, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
    const errKey = `item-${index}-${field === "medicationName" ? "name" : field}`;
    if (fieldErrors[errKey]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[errKey];
        return copy;
      });
    }
  };

  const validateForm = () => {
    if (items.length === 0 && !notes.trim() && !diagnosis.trim()) {
      setValidationError("Please add at least one medication or clinical advice before issuing.");
      return false;
    }
    const errors: Record<string, string> = {};
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.medicationName.trim() || it.medicationName === "Custom") {
        errors[`item-${i}-name`] = `Please enter or select a medicine name for #${i + 1}.`;
      }
      if (!it.dosage.trim() || it.dosage === "Custom") {
        errors[`item-${i}-dosage`] = `Please specify dosage for #${i + 1}.`;
      }
      if (!it.frequency.trim() || it.frequency === "Custom") {
        errors[`item-${i}-frequency`] = `Please select frequency for #${i + 1}.`;
      }
      if (!it.duration.trim() || it.duration === "Custom") {
        errors[`item-${i}-duration`] = `Please select duration for #${i + 1}.`;
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setValidationError("Please fill out all required fields highlighted in red below.");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleOpenPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsPreviewOpen(true);
  };

  const handleDownloadPdf = () => {
    startDownloadTransition(() => {
      const activeRx: ClinicalPrescription = existingPrescription || {
        id: "RX-DRAFT",
        appointment_id: appointmentId,
        doctor_id: "DOC",
        patient_id: "PAT",
        status: "published",
        notes: [diagnosis ? `Diagnosis: ${diagnosis}` : "", notes].filter(Boolean).join("\n\n"),
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        items: items.map((it, idx) => ({
          id: String(idx),
          prescription_id: "RX-DRAFT",
          medication_name: it.medicationName,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          instructions: it.instructions || null,
          sort_order: idx,
        })),
      };

      downloadPrescriptionPdf({
        prescription: activeRx,
        clinicName: clinicName || "Schedula Healthcare Clinic",
        doctorName: doctorName || "Treating Physician",
        doctorSpecialty: doctorSpecialty || "General Medicine",
        doctorRegistrationNo: doctorRegistrationNo || "REG-IN-2024-8192",
        patientName,
        patientGender: patientGender || "Not specified",
        patientDob,
        patientPhone,
        consultationDate: new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
        allergies: allergiesText || "No known drug allergies",
      });
    });
  };

  return (
    <div className="space-y-6">
      {/* Read-only view when prescription already exists and not currently editing (non-modal only) */}
      {!isEditing && existingPrescription && !isModal && (
        <Card className="rounded-2xl border-emerald-500/20 bg-emerald-500/[0.02] shadow-xs">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <FileCheck2 className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Prescription Issued
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Published to patient on{" "}
                  {existingPrescription.published_at
                    ? new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(existingPrescription.published_at))
                    : "record"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="rounded-xl text-xs font-semibold h-8.5 gap-1.5"
              >
                <Download className="size-3.5 text-primary" />
                <span>{isDownloading ? "Generating PDF…" : "Download PDF"}</span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="rounded-xl text-xs font-semibold h-8.5 gap-1.5"
              >
                <Pencil className="size-3.5" />
                <span>Update Prescription</span>
              </Button>

              {isModal && onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  className="rounded-xl text-xs font-semibold h-8.5"
                >
                  Done
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-5 sm:p-6 text-xs">
            {/* Diagnosis Banner if provided */}
            {diagnosis && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Clinical Diagnosis / Impression
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{diagnosis}</p>
              </div>
            )}

            {/* Prescribed Items Table */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Pill className="size-3.5 text-emerald-600" />
                <span>Prescribed Medications ({existingPrescription.items.length})</span>
              </p>

              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 text-[11px] font-bold text-muted-foreground uppercase">
                      <th className="px-3.5 py-2.5">#</th>
                      <th className="px-3.5 py-2.5">Medicine</th>
                      <th className="px-3.5 py-2.5">Dosage</th>
                      <th className="px-3.5 py-2.5">Frequency & Timing</th>
                      <th className="px-3.5 py-2.5">Duration</th>
                      <th className="px-3.5 py-2.5">Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {existingPrescription.items.map((it, idx) => (
                      <tr key={it.id ?? idx} className="hover:bg-muted/20">
                        <td className="px-3.5 py-3 font-mono font-bold text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="px-3.5 py-3 font-bold text-foreground">
                          {it.medication_name}
                        </td>
                        <td className="px-3.5 py-3 font-medium text-foreground">{it.dosage}</td>
                        <td className="px-3.5 py-3 text-foreground">{it.frequency}</td>
                        <td className="px-3.5 py-3 text-foreground">{it.duration}</td>
                        <td className="px-3.5 py-3 text-muted-foreground italic">
                          {it.instructions || "As directed"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Doctor Advice Notes */}
            {notes && (
              <div className="rounded-xl border bg-muted/30 p-4 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">
                  Doctor Advice & Directions
                </p>
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Editing / Creation Form */}
      {isEditing && (
        <form
          action={formAction}
          onSubmit={handleOpenPreview}
          className={cn(
            "space-y-6",
            isModal ? "border-0 p-0 shadow-none bg-transparent" : "rounded-2xl border bg-card p-5 sm:p-6 shadow-xs",
          )}
        >
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="diagnosis" value={diagnosis} />
          <input type="hidden" name="notes" value={notes} />
          <input
            type="hidden"
            name="itemsJson"
            value={JSON.stringify(
              items.map((it) => ({
                medicationName: it.medicationName,
                dosage: it.dosage,
                frequency: it.frequency,
                duration: it.duration,
                instructions: it.instructions,
              })),
            )}
          />

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3 pr-10">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Stethoscope className="size-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                {existingPrescription ? "Update Prescription" : "Create Prescription"}
              </h2>
            </div>

            {!isModal && existingPrescription && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                Cancel editing
              </Button>
            )}
          </div>

          {/* Validation Alert */}
          {validationError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-xs font-bold">Incomplete details</AlertTitle>
              <AlertDescription className="text-xs">{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Server Action Alert */}
          {state.error && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-xs font-bold">Could not issue prescription</AlertTitle>
              <AlertDescription className="text-xs">{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Diagnosis Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="rx-diagnosis"
              className="text-xs font-bold text-foreground"
            >
              Diagnosis <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <Input
              id="rx-diagnosis"
              placeholder="e.g. Acute Bronchitis, Essential Hypertension"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              className="rounded-xl text-xs sm:text-sm font-medium placeholder:text-xs placeholder:text-muted-foreground/60"
              maxLength={200}
            />
          </div>

          {/* Prescribed Medications Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Pill className="size-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Prescribed Medications ({items.length})
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="h-8 rounded-lg text-xs font-semibold gap-1 text-primary"
              >
                <Plus className="size-3" />
                <span>Add Medication</span>
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/10 p-6 text-center space-y-2.5">
                <Pill className="mx-auto size-7 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground">No medications added</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddItem}
                  className="gap-1.5 text-xs rounded-xl"
                >
                  <Plus className="size-3.5" />
                  <span>Add Medication</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-bold text-xs text-foreground">
                        Medicine #{idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1"
                        title="Remove medicine"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span>Remove</span>
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12">
                      {/* Medicine Name (7 cols) */}
                      <div className="sm:col-span-7 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground">
                            Medicine *
                          </label>
                          {fieldErrors[`item-${idx}-name`] && (
                            <span className="text-[11px] font-semibold text-destructive">
                              {fieldErrors[`item-${idx}-name`]}
                            </span>
                          )}
                        </div>
                        <CustomSelect
                          name={`item-${idx}-common-med`}
                          value={COMMON_MEDICATIONS.includes(item.medicationName) ? item.medicationName : item.medicationName ? "custom" : ""}
                          placeholder="-- Select common medicine --"
                          options={[
                            { value: "", label: "-- Select common medicine --" },
                            ...COMMON_MEDICATIONS.map((med) => ({ value: med, label: med })),
                            { value: "custom", label: "Other / Custom medicine..." },
                          ]}
                          onValueChange={(val) => {
                            if (val !== "custom") {
                              handleItemChange(idx, "medicationName", val);
                            } else {
                              handleItemChange(idx, "medicationName", "Custom");
                            }
                          }}
                          className={cn(
                            "h-9 text-xs rounded-lg font-medium",
                            fieldErrors[`item-${idx}-name`] && "border-destructive ring-1 ring-destructive",
                          )}
                          error={Boolean(fieldErrors[`item-${idx}-name`])}
                        />
                        {(!COMMON_MEDICATIONS.includes(item.medicationName) && item.medicationName !== "") && (
                          <Input
                            placeholder="Type custom medicine name & strength"
                            value={item.medicationName === "Custom" ? "" : item.medicationName}
                            onChange={(e) => handleItemChange(idx, "medicationName", e.target.value)}
                            required
                            className={cn(
                              "h-9 rounded-lg text-xs font-semibold placeholder:text-xs placeholder:text-muted-foreground/60",
                              fieldErrors[`item-${idx}-name`] && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        )}
                      </div>

                      {/* Dosage (5 cols) */}
                      <div className="sm:col-span-5 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground">
                            Dosage *
                          </label>
                          {fieldErrors[`item-${idx}-dosage`] && (
                            <span className="text-[11px] font-semibold text-destructive">
                              {fieldErrors[`item-${idx}-dosage`]}
                            </span>
                          )}
                        </div>
                        <CustomSelect
                          name={`item-${idx}-dosage-select`}
                          value={COMMON_DOSAGES.includes(item.dosage) ? item.dosage : item.dosage ? "custom" : ""}
                          placeholder="-- Select dosage --"
                          options={[
                            { value: "", label: "-- Select dosage --" },
                            ...COMMON_DOSAGES.map((d) => ({ value: d, label: d })),
                            { value: "custom", label: "Custom dosage..." },
                          ]}
                          onValueChange={(val) => {
                            if (val !== "custom") {
                              handleItemChange(idx, "dosage", val);
                            } else {
                              handleItemChange(idx, "dosage", "Custom");
                            }
                          }}
                          className={cn(
                            "h-9 text-xs rounded-lg font-medium",
                            fieldErrors[`item-${idx}-dosage`] && "border-destructive ring-1 ring-destructive",
                          )}
                          error={Boolean(fieldErrors[`item-${idx}-dosage`])}
                        />
                        {(!COMMON_DOSAGES.includes(item.dosage) && item.dosage !== "") && (
                          <Input
                            placeholder="Type custom dosage (e.g. 2 Drops)"
                            value={item.dosage === "Custom" ? "" : item.dosage}
                            onChange={(e) => handleItemChange(idx, "dosage", e.target.value)}
                            required
                            className={cn(
                              "h-9 rounded-lg text-xs placeholder:text-xs placeholder:text-muted-foreground/60",
                              fieldErrors[`item-${idx}-dosage`] && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12 pt-2 border-t border-border/40">
                      {/* Frequency (6 cols) */}
                      <div className="sm:col-span-6 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground">
                            Frequency *
                          </label>
                          {fieldErrors[`item-${idx}-frequency`] && (
                            <span className="text-[11px] font-semibold text-destructive">
                              {fieldErrors[`item-${idx}-frequency`]}
                            </span>
                          )}
                        </div>
                        <CustomSelect
                          name={`item-${idx}-frequency-select`}
                          value={COMMON_FREQUENCIES.some((f) => f.label === item.frequency) ? item.frequency : item.frequency ? "custom" : ""}
                          placeholder="-- Select frequency --"
                          options={[
                            { value: "", label: "-- Select frequency --" },
                            ...COMMON_FREQUENCIES.map((f) => ({ value: f.label, label: f.label })),
                            { value: "custom", label: "Custom frequency..." },
                          ]}
                          onValueChange={(val) => {
                            if (val !== "custom") {
                              handleItemChange(idx, "frequency", val);
                            } else {
                              handleItemChange(idx, "frequency", "Custom");
                            }
                          }}
                          className={cn(
                            "h-9 text-xs rounded-lg font-medium",
                            fieldErrors[`item-${idx}-frequency`] && "border-destructive ring-1 ring-destructive",
                          )}
                          error={Boolean(fieldErrors[`item-${idx}-frequency`])}
                        />
                        {(!COMMON_FREQUENCIES.some((f) => f.label === item.frequency) && item.frequency !== "") && (
                          <Input
                            placeholder="Type custom frequency (e.g. Every 8 hours)"
                            value={item.frequency === "Custom" ? "" : item.frequency}
                            onChange={(e) => handleItemChange(idx, "frequency", e.target.value)}
                            required
                            className={cn(
                              "h-9 rounded-lg text-xs placeholder:text-xs placeholder:text-muted-foreground/60",
                              fieldErrors[`item-${idx}-frequency`] && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        )}
                      </div>

                      {/* Duration (6 cols) */}
                      <div className="sm:col-span-6 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground">
                            Duration *
                          </label>
                          {fieldErrors[`item-${idx}-duration`] && (
                            <span className="text-[11px] font-semibold text-destructive">
                              {fieldErrors[`item-${idx}-duration`]}
                            </span>
                          )}
                        </div>
                        <CustomSelect
                          name={`item-${idx}-duration-select`}
                          value={COMMON_DURATIONS.includes(item.duration) ? item.duration : item.duration ? "custom" : ""}
                          placeholder="-- Select duration --"
                          options={[
                            { value: "", label: "-- Select duration --" },
                            ...COMMON_DURATIONS.map((dur) => ({ value: dur, label: dur })),
                            { value: "custom", label: "Custom duration..." },
                          ]}
                          onValueChange={(val) => {
                            if (val !== "custom") {
                              handleItemChange(idx, "duration", val);
                            } else {
                              handleItemChange(idx, "duration", "Custom");
                            }
                          }}
                          className={cn(
                            "h-9 text-xs rounded-lg font-medium",
                            fieldErrors[`item-${idx}-duration`] && "border-destructive ring-1 ring-destructive",
                          )}
                          error={Boolean(fieldErrors[`item-${idx}-duration`])}
                        />
                        {(!COMMON_DURATIONS.includes(item.duration) && item.duration !== "") && (
                          <Input
                            placeholder="Type custom duration (e.g. 21 days)"
                            value={item.duration === "Custom" ? "" : item.duration}
                            onChange={(e) => handleItemChange(idx, "duration", e.target.value)}
                            required
                            className={cn(
                              "h-9 rounded-lg text-xs placeholder:text-xs placeholder:text-muted-foreground/60",
                              fieldErrors[`item-${idx}-duration`] && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        )}
                      </div>
                    </div>

                    {/* Row 3: Instructions (select + text input) */}
                    <div className="space-y-1.5 pt-2 border-t border-border/40">
                      <label className="text-xs font-semibold text-foreground">
                        Instructions <span className="text-muted-foreground font-normal">(Optional)</span>
                      </label>
                      <div className="grid gap-2 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <CustomSelect
                            name={`item-${idx}-instructions-select`}
                            value=""
                            placeholder="-- Choose advice to append --"
                            options={[
                              { value: "", label: "-- Choose advice to append --" },
                              ...COMMON_INSTRUCTIONS.map((inst) => ({ value: inst, label: inst })),
                            ]}
                            onValueChange={(val) => {
                              if (val) {
                                const current = item.instructions || "";
                                handleItemChange(
                                  idx,
                                  "instructions",
                                  current ? `${current}. ${val}` : val,
                                );
                              }
                            }}
                            className="h-9 text-xs rounded-lg font-medium"
                          />
                        </div>
                        <div className="sm:col-span-7">
                          <Input
                            placeholder="e.g. After food with warm water"
                            value={item.instructions}
                            onChange={(e) => handleItemChange(idx, "instructions", e.target.value)}
                            className="h-9 rounded-lg text-xs placeholder:text-xs placeholder:text-muted-foreground/60"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="w-full rounded-xl text-xs font-semibold border-dashed py-3"
              >
                <Plus className="size-3.5 mr-1 text-primary" />
                Add Another Medicine
              </Button>
            )}
          </div>

          {/* Doctor Advice & Directions */}
          <div className="space-y-1.5">
            <label
              htmlFor="rx-notes"
              className="text-xs font-bold text-foreground"
            >
              Doctor&apos;s Advice & Directions <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <Textarea
              id="rx-notes"
              rows={3}
              placeholder="e.g. Rest for 3 days. Drink plenty of oral fluids. Avoid cold food. Review in OPD after 5 days if symptoms persist."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl text-xs sm:text-sm placeholder:text-xs placeholder:text-muted-foreground/60"
              maxLength={1000}
            />
          </div>

          {/* Preview & Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              className="rounded-xl font-semibold gap-2 shadow-xs"
            >
              <Eye className="size-4" />
              <span>Preview Prescription</span>
            </Button>
          </div>
        </form>
      )}

      {/* Prescription Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="shrink-0 p-5 sm:p-6 border-b border-border/70 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold text-foreground">
              <FileText className="size-5 text-primary" />
              <span>Prescription Preview</span>
            </DialogTitle>
          </DialogHeader>

          {/* Official Prescription Slip Canvas Replica */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/10">
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm text-slate-800 space-y-5">
              {/* Letterhead Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
                <div>
                  <h4 className="text-lg font-extrabold tracking-wide text-sky-900 uppercase">
                    {clinicName || "Schedula Health Clinic"}
                  </h4>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Outpatient Department (OPD) • Clinical Consultation
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Clinical Care Tower, Floor 3 • Tel: +91 (080) 4123-4567
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">
                    {doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`}
                  </p>
                  <p className="text-[11px] font-medium text-slate-600">
                    {doctorSpecialty || "General Medicine"} (MBBS, MD)
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Reg No: {doctorRegistrationNo || "REG-IN-2024-8192"}
                  </p>
                </div>
              </div>

              {/* Patient Encounter Details Bar */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <p>
                    <span className="font-bold text-slate-500 uppercase text-[10px]">
                      Patient Name:
                    </span>{" "}
                    <strong className="text-slate-900 text-xs">{patientName}</strong>
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-slate-500 uppercase text-[10px]">
                      Gender / Age:
                    </span>{" "}
                    <span>
                      {patientDob ? `${patientDob} (${patientGender || "Adult"})` : patientGender || "Adult"}
                    </span>
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-slate-500 uppercase text-[10px]">
                      Known Allergies:
                    </span>{" "}
                    <span className="font-semibold text-rose-700">
                      {allergiesText || "No known drug allergies"}
                    </span>
                  </p>
                </div>

                <div className="text-right sm:text-left">
                  <p>
                    <span className="font-bold text-slate-500 uppercase text-[10px]">
                      Date:
                    </span>{" "}
                    <span>
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date())}
                    </span>
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-slate-500 uppercase text-[10px]">
                      Prescription ID:
                    </span>{" "}
                    <span className="font-mono font-bold text-sky-800">
                      PRESC-{appointmentId.slice(0, 8).toUpperCase()}
                    </span>
                  </p>
                  {patientPhone && (
                    <p className="mt-1">
                      <span className="font-bold text-slate-500 uppercase text-[10px]">
                        Contact:
                      </span>{" "}
                      <span>{patientPhone}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Diagnosis if entered */}
              {diagnosis && (
                <div className="rounded-lg bg-sky-50 border border-sky-100 p-2.5 text-xs">
                  <span className="font-bold text-sky-900 uppercase text-[10px]">
                    Clinical Assessment:{" "}
                  </span>
                  <span className="font-semibold text-slate-800">{diagnosis}</span>
                </div>
              )}

              {/* Classic Rx Header */}
              <div>
                <div className="flex items-center gap-2 text-sky-900">
                  <span className="font-serif italic font-extrabold text-2xl">℞</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Prescription Regimen
                  </span>
                </div>

                {/* Medication Table */}
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
                        <th className="p-2">#</th>
                        <th className="p-2">Medication</th>
                        <th className="p-2">Dosage</th>
                        <th className="p-2">Frequency</th>
                        <th className="p-2">Duration</th>
                        <th className="p-2">Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {items.map((it, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                          <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-2 font-bold text-slate-900">{it.medicationName}</td>
                          <td className="p-2">{it.dosage}</td>
                          <td className="p-2">{it.frequency}</td>
                          <td className="p-2">{it.duration}</td>
                          <td className="p-2 text-slate-500 italic">
                            {it.instructions || "As advised"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Advice */}
              {notes && (
                <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Doctor Advice & Directions
                  </p>
                  <p className="text-slate-700 whitespace-pre-line leading-relaxed">{notes}</p>
                </div>
              )}

              {/* Sign-off Strip */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-end justify-between gap-3 text-[10px] text-slate-500">
                <div className="max-w-xs">
                  <p className="font-bold uppercase text-[9px] text-slate-400">Notice</p>
                  <p className="leading-tight mt-0.5">
                    Computer-generated digital prescription valid under NMC Telemedicine Practice Guidelines.
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] uppercase font-bold text-sky-900">
                    Digitally Authorized By
                  </p>
                  <p className="font-bold text-xs text-slate-900 mt-0.5">
                    {doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date())}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-card p-4 sm:p-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPreviewOpen(false)}
              className="rounded-xl"
            >
              Keep editing
            </Button>

            <form
              action={formAction}
              onSubmit={() => {
                // Let formAction execute
              }}
            >
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="diagnosis" value={diagnosis} />
              <input type="hidden" name="notes" value={notes} />
              <input
                type="hidden"
                name="itemsJson"
                value={JSON.stringify(
                  items.map((it) => ({
                    medicationName: it.medicationName,
                    dosage: it.dosage,
                    frequency: it.frequency,
                    duration: it.duration,
                    instructions: it.instructions,
                  })),
                )}
              />
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs"
              >
                <CheckCircle2 className="size-4" />
                <span>{isPending ? "Issuing Prescription…" : "Confirm & Issue Prescription"}</span>
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DoctorPrescriptionDialog({
  open,
  onOpenChange,
  appointmentId,
  patientName,
  patientGender,
  patientDob,
  patientPhone,
  allergiesText,
  doctorName,
  doctorSpecialty,
  doctorRegistrationNo,
  clinicName,
  initialPrescription = null,
  onPrescriptionSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  patientName: string;
  patientGender?: string;
  patientDob?: string;
  patientPhone?: string;
  allergiesText?: string;
  doctorName: string;
  doctorSpecialty?: string;
  doctorRegistrationNo?: string;
  clinicName?: string;
  initialPrescription?: ClinicalPrescription | null;
  onPrescriptionSaved?: (newRx: ClinicalPrescription) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle>Issue Prescription</DialogTitle>
          <DialogDescription>Create or update patient prescription</DialogDescription>
        </DialogHeader>
        <DoctorPrescriptionManager
          appointmentId={appointmentId}
          patientName={patientName}
          patientGender={patientGender}
          patientDob={patientDob}
          patientPhone={patientPhone}
          allergiesText={allergiesText}
          doctorName={doctorName}
          doctorSpecialty={doctorSpecialty}
          doctorRegistrationNo={doctorRegistrationNo}
          clinicName={clinicName}
          initialPrescription={initialPrescription}
          isModal={true}
          onPrescriptionSaved={(rx) => {
            onPrescriptionSaved?.(rx);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
