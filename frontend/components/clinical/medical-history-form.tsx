"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomSelect } from "@/components/ui/custom-select";
import { saveMedicalHistoryAction } from "@/lib/clinical/actions";
import type {
  ClinicalMedicalHistory,
  ClinicalVisit,
  ClinicalPrescription,
} from "@/lib/clinical/queries";
import {
  type CurrentConcern,
  type PastSurgery,
  type SelfReportedMedication,
  parseMedicalDetails,
  serializeMedicalDetails,
} from "@/lib/clinical/vitals";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  PencilLine,
  CheckCircle2,
  UserRound,
  AlertCircle,
  Pill,
  FileText,
  Calendar,
  Check,
} from "lucide-react";

type AllergyEntry = { substance: string; reaction: string; severity: "unknown" | "mild" | "moderate" | "severe" };
type ConditionEntry = { name: string; status: "active" | "resolved"; notes: string };
export type MedicalHistoryEditorSection = "personal" | "conditions" | "allergies" | "concerns" | "surgeries" | "medications" | "all";

const commonConditions = [
  "Asthma",
  "Diabetes",
  "Heart disease",
  "High blood pressure",
  "Kidney disease",
  "Thyroid condition",
  "Arthritis",
  "COPD",
  "Epilepsy",
  "Depression or anxiety",
];

const genderOptions = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
  { value: "Prefer not to say", label: "Prefer not to say" },
];

const bloodGroupOptions = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
];

function formatVisitDate(value: string, timezone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function parseAllergyText(text: string): AllergyEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [substance = "", reaction = "", severity = "unknown"] = line.split("|").map((p) => p.trim());
      const cleanSev = ["mild", "moderate", "severe"].includes(severity.toLowerCase())
        ? (severity.toLowerCase() as "mild" | "moderate" | "severe")
        : "unknown";
      return { substance, reaction, severity: cleanSev };
    });
}

function parseConditionText(text: string): ConditionEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", status = "active", notes = ""] = line.split("|").map((p) => p.trim());
      const cleanStatus = status.toLowerCase() === "resolved" ? "resolved" : "active";
      return { name, status: cleanStatus, notes };
    });
}

function serializeAllergies(items: AllergyEntry[]) {
  return items.map((i) => [i.substance, i.reaction, i.severity].filter(Boolean).join(" | ")).join("\n");
}

function serializeConditions(items: ConditionEntry[]) {
  return items.map((i) => [i.name, i.status, i.notes].filter(Boolean).join(" | ")).join("\n");
}

type ReviewState =
  | {
      type: "personal";
      personal: {
        gender: string;
        bloodGroup: string;
        height: string;
        weight: string;
        primaryContactName: string;
        primaryContactPhone: string;
      };
    }
  | {
      type: "medications";
      medication: SelfReportedMedication;
    }
  | {
      type: "general";
      allergyStatus: string;
      allergyCount: number;
      conditionCount: number;
      hasDetails: boolean;
    };

export function MedicalHistoryForm({
  patientId,
  history,
  editor,
  section = "all",
  initialConditionName,
  pastConsultations = [],
  prescriptions = [],
  onSaved,
  onCancel,
}: {
  patientId: string;
  history: ClinicalMedicalHistory | null;
  editor: "patient" | "doctor";
  section?: MedicalHistoryEditorSection;
  initialConditionName?: string | null;
  pastConsultations?: ClinicalVisit[];
  prescriptions?: ClinicalPrescription[];
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState(saveMedicalHistoryAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const conditionsInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [review, setReview] = useState<ReviewState | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const version = state.version ?? history?.version ?? 0;

  // Form interactive state
  const [allergiesStatus, setAllergiesStatus] = useState<string>(history?.allergies.status ?? "unknown");
  const [allergiesText, setAllergiesText] = useState(() => serializeAllergies(history?.allergies.items ?? []));
  const [conditionsText, setConditionsText] = useState(() => serializeConditions(history?.conditions.items ?? []));

  // Condition parsing & editing item resolution
  const conditionItems = useMemo(() => parseConditionText(conditionsText), [conditionsText]);
  const editingCondition = useMemo(() => {
    if (!initialConditionName) return null;
    return conditionItems.find((c) => c.name.toLowerCase() === initialConditionName.toLowerCase()) ?? null;
  }, [conditionItems, initialConditionName]);

  const existingConditionNames = useMemo(() => {
    return new Set(
      conditionItems
        .filter((c) => !editingCondition || c.name.toLowerCase() !== editingCondition.name.toLowerCase())
        .map((c) => c.name.trim().toLowerCase()),
    );
  }, [conditionItems, editingCondition]);

  const availableCommonConditions = useMemo(() => {
    return commonConditions.filter((c) => !existingConditionNames.has(c.toLowerCase()));
  }, [existingConditionNames]);

  // Personal Vitals & Contact State
  const initialDetails = parseMedicalDetails(history?.medical_details);
  const [gender, setGender] = useState(initialDetails.vitals.gender ?? "");
  const [bloodGroup, setBloodGroup] = useState(initialDetails.vitals.bloodGroup ?? "");
  const [height, setHeight] = useState(initialDetails.vitals.height ?? "");
  const [weight, setWeight] = useState(initialDetails.vitals.weight ?? "");
  const [primaryContactName, setPrimaryContactName] = useState(initialDetails.vitals.primaryContactName ?? "");
  const [primaryContactPhone, setPrimaryContactPhone] = useState(initialDetails.vitals.primaryContactPhone ?? "");
  const [notes, setNotes] = useState(initialDetails.notes);
  const [healthProfile, setHealthProfile] = useState(initialDetails.healthProfile);

  // Builder helper states
  const [newSubstance, setNewSubstance] = useState("");
  const [newReaction, setNewReaction] = useState("");
  const [newSeverity, setNewSeverity] = useState<"mild" | "moderate" | "severe" | "unknown">("mild");

  const [newCondName, setNewCondName] = useState(() => editingCondition?.name ?? "");
  const [newCondStatus, setNewCondStatus] = useState<"active" | "resolved">(() => editingCondition?.status ?? "active");
  const [newCondNotes, setNewCondNotes] = useState(() => editingCondition?.notes ?? "");
  const [newConcern, setNewConcern] = useState<CurrentConcern>({ description: "", onset: "" });
  const [newSurgery, setNewSurgery] = useState<PastSurgery>({ procedure: "", approximateDate: "", notes: "" });

  // Medication tab states
  const [medSourceTab, setMedSourceTab] = useState<"prescription" | "manual">("prescription");
  const [selectedVisitId, setSelectedVisitId] = useState<string>("");
  const [newMedication, setNewMedication] = useState<SelfReportedMedication>({
    name: "",
    dosage: "",
    frequency: "",
    duration: "",
    startDate: "",
    source: "",
  });
  const [stagedMedication, setStagedMedication] = useState<SelfReportedMedication | null>(null);

  useEffect(() => {
    if (editingCondition) {
      setNewCondName(editingCondition.name);
      setNewCondStatus(editingCondition.status);
      setNewCondNotes(editingCondition.notes);
    }
  }, [editingCondition]);

  const isDuplicate = Boolean(
    newCondName.trim() && existingConditionNames.has(newCondName.trim().toLowerCase()),
  );

  const [manualMode, setManualMode] = useState(false);
  const showAllergies = section === "all" || section === "allergies";
  const showConditions = section === "all" || section === "conditions";
  const showPersonal = section === "all" || section === "personal";
  const showConcerns = section === "all" || section === "concerns";
  const showSurgeries = section === "all" || section === "surgeries";
  const showMedications = section === "all" || section === "medications";

  const allergyItems = parseAllergyText(allergiesText);

  useEffect(() => {
    if (state.success && onSaved) onSaved();
  }, [onSaved, state.success]);

  // Sync status when items change
  const handleAddAllergy = () => {
    if (!newSubstance.trim()) return;
    const updated = [...allergyItems, { substance: newSubstance.trim(), reaction: newReaction.trim(), severity: newSeverity }];
    setAllergiesText(serializeAllergies(updated));
    setAllergiesStatus("recorded");
    setNewSubstance("");
    setNewReaction("");
    setNewSeverity("mild");
  };

  const handleRemoveAllergy = (index: number) => {
    const updated = allergyItems.filter((_, i) => i !== index);
    setAllergiesText(serializeAllergies(updated));
    if (updated.length === 0) setAllergiesStatus("none_known");
  };

  const handleSaveConditionDirect = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const name = newCondName.trim();
    if (!name || isDuplicate) return;

    let updated: ConditionEntry[];
    if (editingCondition) {
      updated = conditionItems.map((c) =>
        c.name.toLowerCase() === editingCondition.name.toLowerCase()
          ? { name: c.name, status: newCondStatus, notes: newCondNotes.trim() }
          : c,
      );
    } else {
      updated = [...conditionItems, { name, status: newCondStatus, notes: newCondNotes.trim() }];
    }

    const serialized = serializeConditions(updated);
    if (conditionsInputRef.current) {
      conditionsInputRef.current.value = serialized;
    }
    setConditionsText(serialized);
    submittingRef.current = true;
    formRef.current?.requestSubmit();
  };

  const handleDeleteConditionDirect = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!editingCondition) return;
    const updated = conditionItems.filter((c) => c.name.toLowerCase() !== editingCondition.name.toLowerCase());
    const serialized = serializeConditions(updated);
    if (conditionsInputRef.current) {
      conditionsInputRef.current.value = serialized;
    }
    setConditionsText(serialized);
    submittingRef.current = true;
    formRef.current?.requestSubmit();
  };


  const addConcern = () => {
    if (!newConcern.description.trim()) return;
    setHealthProfile((current) => ({
      ...current,
      currentConcerns: [...current.currentConcerns, { description: newConcern.description.trim(), onset: newConcern.onset.trim() }],
    }));
    setNewConcern({ description: "", onset: "" });
  };

  const addSurgery = () => {
    if (!newSurgery.procedure.trim()) return;
    setHealthProfile((current) => ({
      ...current,
      pastSurgeries: [...current.pastSurgeries, { procedure: newSurgery.procedure.trim(), approximateDate: newSurgery.approximateDate.trim(), notes: newSurgery.notes.trim() }],
    }));
    setNewSurgery({ procedure: "", approximateDate: "", notes: "" });
  };

  const handleStatusChange = (newStatus: string) => {
    setAllergiesStatus(newStatus);
    if (newStatus === "none_known" || newStatus === "unknown") {
      setAllergiesText("");
    }
  };

  // Consultation options for fetching prescription
  const consultationOptions = useMemo(() => {
    return pastConsultations.map((v) => ({
      value: v.appointment_id,
      label: `Dr. ${v.doctor_name} (${v.specialty || "General Medicine"}) · ${formatVisitDate(v.slot_start_at, v.timezone)}`,
    }));
  }, [pastConsultations]);

  const selectedVisit = useMemo(() => {
    if (!selectedVisitId) return null;
    return pastConsultations.find((v) => v.appointment_id === selectedVisitId) ?? null;
  }, [selectedVisitId, pastConsultations]);

  const selectedPrescription = useMemo(() => {
    if (!selectedVisitId) return null;
    return prescriptions.find((p) => p.appointment_id === selectedVisitId) ?? null;
  }, [selectedVisitId, prescriptions]);

  // Compute profile to serialize (including staged medication if review is active)
  const profileToSerialize = useMemo(() => {
    if (section === "medications" && stagedMedication) {
      return {
        ...healthProfile,
        selfReportedMedications: [...healthProfile.selfReportedMedications, stagedMedication],
      };
    }
    return healthProfile;
  }, [healthProfile, section, stagedMedication]);

  function handleStartReview(form: HTMLFormElement) {
    if (section === "personal") {
      const hasAnyValue =
        Boolean(gender) ||
        Boolean(bloodGroup) ||
        Boolean(height.trim()) ||
        Boolean(weight.trim()) ||
        Boolean(primaryContactName.trim()) ||
        Boolean(primaryContactPhone.trim());

      if (!hasAnyValue) {
        setValidationError("Please fill in at least one personal vitals or contact field.");
        return;
      }

      if (primaryContactPhone.trim()) {
        const digits = primaryContactPhone.replace(/\D/g, "");
        if (digits.length < 10) {
          setValidationError("Please enter a valid 10-digit primary contact phone number.");
          return;
        }
        if (!primaryContactName.trim()) {
          setValidationError("Please enter the contact person's name for this phone number.");
          return;
        }
      }

      setValidationError(null);
      setReview({
        type: "personal",
        personal: {
          gender,
          bloodGroup,
          height: height.trim(),
          weight: weight.trim(),
          primaryContactName: primaryContactName.trim(),
          primaryContactPhone: primaryContactPhone.trim(),
        },
      });
      return;
    }

    if (section === "medications") {
      if (!newMedication.name.trim()) {
        setValidationError("Please select or enter a medication name.");
        return;
      }

      setValidationError(null);
      const staged: SelfReportedMedication = {
        name: newMedication.name.trim(),
        dosage: newMedication.dosage.trim(),
        frequency: newMedication.frequency.trim(),
        duration: newMedication.duration.trim(),
        startDate: newMedication.startDate.trim(),
        source: newMedication.source.trim(),
      };
      setStagedMedication(staged);
      setReview({
        type: "medications",
        medication: staged,
      });
      return;
    }

    // Default / "all" review
    const values = new FormData(form);
    setValidationError(null);
    setReview({
      type: "general",
      allergyStatus: String(values.get("allergiesStatus") ?? "unknown"),
      allergyCount: String(values.get("allergies") ?? "").split(/\r?\n/).filter((value) => value.trim()).length,
      conditionCount: String(values.get("conditions") ?? "").split(/\r?\n/).filter((value) => value.trim()).length,
      hasDetails: Boolean(String(values.get("medicalDetails") ?? "").trim()),
    });
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        if (section === "conditions") {
          submittingRef.current = false;
          return;
        }
        if (!submittingRef.current) {
          event.preventDefault();
          handleStartReview(event.currentTarget);
          return;
        }
        submittingRef.current = false;
      }}
      className={cn(
        "grid gap-5",
        section === "all" ? "rounded-2xl border bg-card p-5 sm:p-6 shadow-xs" : "pt-1",
      )}
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="expectedVersion" value={version} />

      {/* Synchronized hidden values */}
      <input type="hidden" name="allergiesStatus" value={allergiesStatus} />
      <input type="hidden" name="allergies" value={allergiesText} />
      <input type="hidden" name="conditions" ref={conditionsInputRef} value={conditionsText} />
      <input
        type="hidden"
        name="medicalDetails"
        value={serializeMedicalDetails(
          { gender, bloodGroup, height, weight, primaryContactName, primaryContactPhone },
          notes,
          profileToSerialize,
        )}
      />

      {/* Header for "all" section */}
      {section === "all" && !review && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-base font-bold sm:text-lg text-foreground">
              {editor === "doctor" ? "Verify medical history" : "Update medical history"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {editor === "doctor"
                ? "Saving creates a clinician-verified revision and preserves the earlier report."
                : "Your updates are recorded as self-reported and reviewed by your care team."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setManualMode((prev) => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground h-8"
          >
            <PencilLine className="size-3.5 mr-1" />
            {manualMode ? "Structured mode" : "Raw text mode"}
          </Button>
        </div>
      )}

      {/* Validation Error Alert */}
      {validationError && (
        <Alert variant="destructive" className="rounded-xl py-2.5 px-3.5 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-xs font-medium">{validationError}</AlertDescription>
        </Alert>
      )}

      {/* ========================================================================= */}
      {/* PREVIEW MODE: EXCLUSIVELY SHOWN WHEN REVIEW IS ACTIVE                    */}
      {/* ========================================================================= */}
      {review ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5 dark:border-sky-900/50 dark:bg-sky-950/20 shadow-xs">
            <div className="flex items-center gap-2 border-b border-sky-200/60 dark:border-sky-800/60 pb-3">
              <CheckCircle2 className="size-5 text-sky-600 dark:text-sky-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {review.type === "personal"
                    ? "Review Personal & Biometric Details"
                    : review.type === "medications"
                      ? "Review Medication to Add"
                      : "Review Details Before Saving"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Verify the information below. Click &ldquo;Confirm and save&rdquo; to update your medical profile.
                </p>
              </div>
            </div>

            {/* Personal Details Preview */}
            {review.type === "personal" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border bg-card p-3 space-y-1 shadow-2xs">
                  <span className="text-muted-foreground text-[11px] font-medium">Gender</span>
                  <p className="font-semibold text-foreground text-sm">{review.personal.gender || "Not specified"}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 space-y-1 shadow-2xs">
                  <span className="text-muted-foreground text-[11px] font-medium">Blood Group</span>
                  <p className="font-semibold text-foreground text-sm">{review.personal.bloodGroup || "Not specified"}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 space-y-1 shadow-2xs">
                  <span className="text-muted-foreground text-[11px] font-medium">Height</span>
                  <p className="font-semibold text-foreground text-sm">{review.personal.height || "Not specified"}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 space-y-1 shadow-2xs">
                  <span className="text-muted-foreground text-[11px] font-medium">Weight</span>
                  <p className="font-semibold text-foreground text-sm">{review.personal.weight || "Not specified"}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 space-y-1 shadow-2xs">
                  <span className="text-muted-foreground text-[11px] font-medium">Primary Emergency Contact</span>
                  <p className="font-semibold text-foreground text-sm">{review.personal.primaryContactName || "Not specified"}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 space-y-1 shadow-2xs">
                  <span className="text-muted-foreground text-[11px] font-medium">Contact Phone</span>
                  <p className="font-semibold text-foreground text-sm">{review.personal.primaryContactPhone || "Not specified"}</p>
                </div>
              </div>
            )}

            {/* Medication Preview */}
            {review.type === "medications" && (
              <div className="mt-4 rounded-xl border bg-card p-4 space-y-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Pill className="size-4 text-sky-600 dark:text-sky-400" />
                  <span className="font-bold text-foreground text-sm">{review.medication.name}</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground text-[11px]">Dosage / Strength:</span>
                    <p className="font-semibold text-foreground">{review.medication.dosage || "As advised"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Frequency / Regimen:</span>
                    <p className="font-semibold text-foreground">{review.medication.frequency || "As advised"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Duration:</span>
                    <p className="font-semibold text-foreground">{review.medication.duration || "Ongoing"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Start Date:</span>
                    <p className="font-semibold text-foreground">{review.medication.startDate || "Current / Ongoing"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground text-[11px]">Prescribed By / Source:</span>
                    <p className="font-semibold text-foreground">{review.medication.source || "Self-reported"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* General Overview Preview */}
            {review.type === "general" && (
              <div className="mt-3 text-xs leading-relaxed text-foreground/90 space-y-2">
                <p>
                  Allergy status: <strong>{review.allergyStatus === "none_known" ? "No known allergies" : review.allergyStatus.replace("_", " ")}</strong>.
                  This revision contains {review.allergyCount} allergy record{review.allergyCount === 1 ? "" : "s"},{" "}
                  {review.conditionCount} condition{review.conditionCount === 1 ? "" : "s"}
                  {review.hasDetails ? ", and additional medical details" : ""}.
                </p>
                <p className="text-muted-foreground">
                  {editor === "doctor"
                    ? "This update will be signed and marked as clinician-verified."
                    : "This update will be visible to your treating doctor as self-reported."}
                </p>
              </div>
            )}
          </div>

          {/* Action CTAs in Preview Mode */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReview(null);
                setStagedMedication(null);
              }}
              className="rounded-xl text-xs font-semibold h-10 px-4"
            >
              Keep editing
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                submittingRef.current = true;
                formRef.current?.requestSubmit();
              }}
              disabled={pending}
              className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold h-10 px-5 shadow-xs transition-colors"
            >
              {pending ? "Saving…" : "Confirm and save"}
            </Button>
          </div>
        </div>
      ) : (
        /* ======================================================================= */
        /* EDITING MODE: FORM INPUTS                                              */
        /* ======================================================================= */
        <>
          {/* PERSONAL AND BIOMETRIC DETAILS SECTION */}
          {showPersonal && section === "personal" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <UserRound className="size-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D2153] dark:text-white">
                  Personal Vitals & Primary Contact
                </h3>
              </div>

              {/* Spacious 2-Column Grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Gender */}
                <div className="space-y-1.5">
                  <label htmlFor="patient-gender-input" className="text-xs font-semibold text-foreground">
                    Gender
                  </label>
                  <CustomSelect
                    id="patient-gender-input"
                    name="gender"
                    value={gender}
                    onValueChange={(val) => {
                      setGender(val);
                      setValidationError(null);
                    }}
                    placeholder="Select gender"
                    options={genderOptions}
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                {/* Blood Group */}
                <div className="space-y-1.5">
                  <label htmlFor="patient-bloodgroup-input" className="text-xs font-semibold text-foreground">
                    Blood Group
                  </label>
                  <CustomSelect
                    id="patient-bloodgroup-input"
                    name="bloodGroup"
                    value={bloodGroup}
                    onValueChange={(val) => {
                      setBloodGroup(val);
                      setValidationError(null);
                    }}
                    placeholder="Select blood group"
                    options={bloodGroupOptions}
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                {/* Height */}
                <div className="space-y-1.5">
                  <label htmlFor="patient-height-input" className="text-xs font-semibold text-foreground">
                    Height
                  </label>
                  <Input
                    id="patient-height-input"
                    value={height}
                    onChange={(e) => {
                      setHeight(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="e.g. 175 cm"
                    className="h-10 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                  />
                </div>

                {/* Weight */}
                <div className="space-y-1.5">
                  <label htmlFor="patient-weight-input" className="text-xs font-semibold text-foreground">
                    Weight
                  </label>
                  <Input
                    id="patient-weight-input"
                    value={weight}
                    onChange={(e) => {
                      setWeight(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="e.g. 68 kg"
                    className="h-10 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                  />
                </div>

                {/* Primary Emergency Contact Name */}
                <div className="space-y-1.5 sm:col-span-1">
                  <label htmlFor="patient-primary-name" className="text-xs font-semibold text-foreground">
                    Primary Emergency Contact Name
                  </label>
                  <Input
                    id="patient-primary-name"
                    value={primaryContactName}
                    onChange={(e) => {
                      setPrimaryContactName(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="e.g. Rohit Pandey"
                    className="h-10 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                  />
                </div>

                {/* Primary Emergency Contact Phone */}
                <div className="space-y-1.5 sm:col-span-1">
                  <label htmlFor="patient-primary-phone" className="text-xs font-semibold text-foreground">
                    Primary Emergency Contact Phone
                  </label>
                  <Input
                    id="patient-primary-phone"
                    value={primaryContactPhone}
                    onChange={(e) => {
                      setPrimaryContactPhone(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="e.g. +91 98765 43210"
                    className="h-10 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-xl text-xs font-semibold h-10 px-4"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending}
                  className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold h-10 px-5 shadow-xs transition-colors"
                >
                  Review changes
                </Button>
              </div>
            </div>
          )}

          {/* MEDICATIONS ADD SECTION */}
          {showMedications && section === "medications" && (
            <div className="space-y-4">
              {/* Option Selector: From past consultation vs Enter manually */}
              <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMedSourceTab("prescription");
                    setValidationError(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all",
                    medSourceTab === "prescription"
                      ? "bg-white dark:bg-card text-sky-700 dark:text-sky-300 shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="size-3.5" />
                  <span>From past consultation</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMedSourceTab("manual");
                    setValidationError(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all",
                    medSourceTab === "manual"
                      ? "bg-white dark:bg-card text-sky-700 dark:text-sky-300 shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <PencilLine className="size-3.5" />
                  <span>Enter manually</span>
                </button>
              </div>

              {/* TAB 1: FETCH FROM PAST CONSULTATION */}
              {medSourceTab === "prescription" && (
                <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/30 p-3.5 dark:border-sky-950 dark:bg-sky-950/10">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-sky-600" />
                      <span>Select consultation to fetch medicines from</span>
                    </label>
                    {consultationOptions.length > 0 ? (
                      <CustomSelect
                        name="consultation-picker"
                        value={selectedVisitId}
                        onValueChange={(val) => {
                          setSelectedVisitId(val);
                          setValidationError(null);
                        }}
                        placeholder="Choose completed consultation"
                        options={consultationOptions}
                        className="h-10 text-xs rounded-xl bg-background"
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                        No completed consultations found. Switch to &ldquo;Enter manually&rdquo; to add medicines.
                      </div>
                    )}
                  </div>

                  {/* Display medicines from selected consultation */}
                  {selectedVisitId && (
                    <div className="space-y-2 pt-2 border-t border-sky-100/80 dark:border-sky-900/40">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Prescribed Medicines
                      </span>
                      {selectedPrescription && selectedPrescription.items.length > 0 ? (
                        <div className="grid gap-2">
                          {selectedPrescription.items.map((item) => {
                            const isChosen = newMedication.name.toLowerCase() === item.medication_name.toLowerCase();
                            return (
                              <div
                                key={item.id}
                                className={cn(
                                  "flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs transition-all",
                                  isChosen
                                    ? "border-sky-500 bg-sky-500/10 shadow-2xs ring-1 ring-sky-400"
                                    : "border-border/70 bg-card hover:border-sky-300",
                                )}
                              >
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <Pill className="size-3.5 text-sky-600" />
                                    <span className="font-bold text-foreground">{item.medication_name}</span>
                                    <span className="text-[11px] text-muted-foreground font-semibold">({item.dosage})</span>
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {item.frequency} · {item.duration}
                                    {item.instructions ? ` · ${item.instructions}` : ""}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isChosen ? "default" : "outline"}
                                  onClick={() => {
                                    setNewMedication({
                                      name: item.medication_name,
                                      dosage: item.dosage,
                                      frequency: item.frequency,
                                      duration: item.duration,
                                      source: selectedVisit
                                        ? `Dr. ${selectedVisit.doctor_name} (${selectedVisit.specialty})`
                                        : "Past prescription",
                                      startDate: selectedVisit ? formatVisitDate(selectedVisit.slot_start_at, selectedVisit.timezone) : "",
                                    });
                                    setValidationError(null);
                                  }}
                                  className={cn(
                                    "h-7 text-xs font-semibold rounded-lg px-2.5",
                                    isChosen
                                      ? "bg-sky-600 text-white"
                                      : "border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300",
                                  )}
                                >
                                  {isChosen ? (
                                    <>
                                      <Check className="size-3 mr-1" /> Selected
                                    </>
                                  ) : (
                                    "Select"
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-center text-xs text-muted-foreground">
                          No digital prescription was issued for this consultation. Switch to &ldquo;Enter manually&rdquo; above.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MEDICATION DETAIL FIELDS (Populated or Manually Entered) */}
              <div className="space-y-3 rounded-xl border bg-muted/15 p-3.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {medSourceTab === "prescription" ? "Verify & Adjust Medication Details" : "Medication Details"}
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Medicine Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={newMedication.name}
                      onChange={(e) => {
                        setNewMedication((prev) => ({ ...prev, name: e.target.value }));
                        setValidationError(null);
                      }}
                      placeholder="e.g. Metformin, Paracetamol"
                      className="h-9 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                      required
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Dose / Strength</label>
                    <Input
                      value={newMedication.dosage}
                      onChange={(e) => setNewMedication((prev) => ({ ...prev, dosage: e.target.value }))}
                      placeholder="e.g. 500mg, 1 tablet"
                      className="h-9 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">How Often (Frequency)</label>
                    <Input
                      value={newMedication.frequency}
                      onChange={(e) => setNewMedication((prev) => ({ ...prev, frequency: e.target.value }))}
                      placeholder="e.g. Twice daily with meals"
                      className="h-9 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Duration</label>
                    <Input
                      value={newMedication.duration}
                      onChange={(e) => setNewMedication((prev) => ({ ...prev, duration: e.target.value }))}
                      placeholder="e.g. 5 days, 30 days, Ongoing"
                      className="h-9 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Started From</label>
                    <Input
                      value={newMedication.startDate}
                      onChange={(e) => setNewMedication((prev) => ({ ...prev, startDate: e.target.value }))}
                      placeholder="e.g. 15 Jan 2026"
                      className="h-9 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Prescriber or Source</label>
                    <Input
                      value={newMedication.source}
                      onChange={(e) => setNewMedication((prev) => ({ ...prev, source: e.target.value }))}
                      placeholder="e.g. Dr. Sharma / Over the counter"
                      className="h-9 text-xs rounded-xl placeholder:text-xs placeholder:text-muted-foreground/60"
                      maxLength={160}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-xl text-xs font-semibold h-10 px-4"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || !newMedication.name.trim()}
                  className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold h-10 px-5 shadow-xs transition-colors"
                >
                  Review medication
                </Button>
              </div>
            </div>
          )}

          {/* ALLERGIES BUILDER */}
          {showAllergies && (
            <>
              <div className="space-y-2">
                <label htmlFor="allergies-status-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Allergy status
                </label>
                <select
                  id="allergies-status-select"
                  name="allergiesStatus"
                  value={allergiesStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                >
                  <option value="none_known">No known allergies</option>
                  <option value="recorded">Allergies listed (specify below)</option>
                  <option value="unknown">Not recorded / unsure</option>
                </select>
              </div>

              <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-foreground">Allergies & Reactions</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {allergyItems.length} {allergyItems.length === 1 ? "allergen" : "allergens"}
                  </span>
                </div>

                {allergiesStatus === "none_known" ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
                    <span>Marked as: No known allergies. Add an item below to list specific allergies.</span>
                  </div>
                ) : allergyItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No specific allergies added yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {allergyItems.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 rounded-lg border bg-card p-2.5 text-xs shadow-2xs">
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span>{item.substance}</span>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase",
                                item.severity === "severe"
                                  ? "bg-destructive/10 text-destructive"
                                  : item.severity === "moderate"
                                    ? "bg-amber-500/10 text-amber-600"
                                    : "bg-sky-500/10 text-sky-600",
                              )}
                            >
                              {item.severity}
                            </span>
                          </div>
                          {item.reaction && <p className="mt-1 text-[11px] text-muted-foreground">Reaction: {item.reaction}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAllergy(idx)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${item.substance}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!manualMode ? (
                  <div className="grid gap-2 border-t pt-3 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-4">
                      <label className="text-[11px] font-medium text-muted-foreground">Substance / Medication</label>
                      <Input
                        placeholder="e.g. Penicillin, Peanuts"
                        value={newSubstance}
                        onChange={(e) => setNewSubstance(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-[11px] font-medium text-muted-foreground">Reaction (optional)</label>
                      <Input
                        placeholder="e.g. Skin rash, swelling"
                        value={newReaction}
                        onChange={(e) => setNewReaction(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-medium text-muted-foreground">Severity</label>
                      <select
                        value={newSeverity}
                        onChange={(e) => setNewSeverity(e.target.value as "mild" | "moderate" | "severe" | "unknown")}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="mild">Mild</option>
                        <option value="moderate">Moderate</option>
                        <option value="severe">Severe</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddAllergy}
                        disabled={!newSubstance.trim()}
                        className="h-8 w-full text-xs"
                      >
                        <Plus className="size-3 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className={cn("space-y-1", !manualMode && "hidden")}>
                  <label htmlFor="allergies-textarea" className="text-xs font-medium text-muted-foreground">
                    Raw Allergies (substance | reaction | severity)
                  </label>
                  <Textarea
                    id="allergies-textarea"
                    value={allergiesText}
                    onChange={(e) => setAllergiesText(e.target.value)}
                    maxLength={4000}
                    rows={3}
                    placeholder="Penicillin | rash | moderate"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </>
          )}

          {/* CONDITIONS POPUP SECTION */}
          {showConditions && section === "conditions" && (
            <div className="space-y-4">
              {!editingCondition && availableCommonConditions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Common conditions
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCommonConditions.map((condition) => {
                      const isSelected = newCondName.toLowerCase() === condition.toLowerCase();
                      return (
                        <button
                          key={condition}
                          type="button"
                          onClick={() => setNewCondName(condition)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            isSelected
                              ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold ring-1 ring-sky-400"
                              : "border-border/60 bg-muted/30 text-foreground hover:bg-muted/60 hover:border-border",
                          )}
                        >
                          <Plus className="size-3" />
                          <span>{condition}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="condition-name-input"
                  className="text-xs font-semibold text-foreground flex items-center justify-between"
                >
                  <span>
                    Condition Name <span className="text-destructive">*</span>
                  </span>
                  {isDuplicate && (
                    <span className="text-[11px] font-medium text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" /> Already recorded in your profile
                    </span>
                  )}
                </label>
                <Input
                  id="condition-name-input"
                  placeholder="e.g. Type 2 Diabetes, Asthma, Migraine"
                  value={newCondName}
                  disabled={Boolean(editingCondition)}
                  onChange={(e) => setNewCondName(e.target.value)}
                  className={cn(
                    "h-9 text-sm rounded-xl",
                    isDuplicate && "border-destructive focus-visible:ring-destructive",
                  )}
                  required
                  maxLength={160}
                />
                {isDuplicate && (
                  <p className="text-[11px] text-destructive">
                    &ldquo;{newCondName.trim()}&rdquo; is already in your health records. Duplicate conditions cannot be added again.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Status</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewCondStatus("active")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all",
                      newCondStatus === "active"
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 shadow-2xs font-bold ring-1 ring-emerald-500/30"
                        : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>Active (Ongoing)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCondStatus("resolved")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all",
                      newCondStatus === "resolved"
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300 shadow-2xs font-bold ring-1 ring-sky-500/30"
                        : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <span className="size-2 rounded-full bg-sky-500" />
                    <span>Past / Resolved</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="condition-notes-input" className="text-xs font-semibold text-foreground">
                  Notes or Treatment <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="condition-notes-input"
                  placeholder="e.g. Controlled with daily inhaler, diagnosed in 2021"
                  value={newCondNotes}
                  onChange={(e) => setNewCondNotes(e.target.value)}
                  className="h-9 text-sm rounded-xl"
                  maxLength={500}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
                {editingCondition && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteConditionDirect}
                    disabled={pending}
                    className="mr-auto rounded-xl text-destructive hover:bg-destructive/10 hover:border-destructive/30 text-xs font-semibold h-9 px-3 gap-1.5"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Delete Condition</span>
                  </Button>
                )}
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-xl text-xs font-semibold h-9 px-4"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveConditionDirect}
                  disabled={pending || isDuplicate || !newCondName.trim()}
                  className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold h-9 px-4 shadow-xs"
                >
                  {pending ? "Saving…" : editingCondition ? "Save Changes" : "Save Condition"}
                </Button>
              </div>
            </div>
          )}

          {/* OTHER CONCERNS & SURGERIES (for section === "concerns" | "surgeries" | "all") */}
          {editor === "patient" && (showConcerns || showSurgeries) && (
            <div className="grid gap-4">
              {showConcerns && (
                <div className="rounded-xl border bg-muted/15 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Current concerns</h3>
                    <p className="text-xs text-muted-foreground">
                      Describe what you are currently experiencing. This is self-reported information, not a diagnosis.
                    </p>
                  </div>
                  {healthProfile.currentConcerns.map((item, index) => (
                    <div key={`${item.description}-${index}`} className="flex items-start justify-between rounded-lg border bg-card p-2 text-xs">
                      <span>
                        {item.description}
                        {item.onset ? ` · Since ${item.onset}` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove concern ${item.description}`}
                        onClick={() =>
                          setHealthProfile((current) => ({
                            ...current,
                            currentConcerns: current.currentConcerns.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                    <Input
                      value={newConcern.description}
                      onChange={(event) => setNewConcern((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Problem or symptom"
                      maxLength={300}
                    />
                    <Input
                      value={newConcern.onset}
                      onChange={(event) => setNewConcern((current) => ({ ...current, onset: event.target.value }))}
                      placeholder="Since when (optional)"
                      maxLength={80}
                    />
                    <Button type="button" variant="outline" onClick={addConcern} disabled={!newConcern.description.trim()}>
                      <Plus className="size-4" /> Add
                    </Button>
                  </div>
                </div>
              )}

              {showSurgeries && (
                <div className="rounded-xl border bg-muted/15 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Past surgeries and operations</h3>
                    <p className="text-xs text-muted-foreground">Add procedures you want your care team to know about.</p>
                  </div>
                  {healthProfile.pastSurgeries.map((item, index) => (
                    <div key={`${item.procedure}-${index}`} className="flex items-start justify-between rounded-lg border bg-card p-2 text-xs">
                      <span>
                        {item.procedure}
                        {item.approximateDate ? ` · ${item.approximateDate}` : ""}
                        {item.notes ? ` · ${item.notes}` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove surgery ${item.procedure}`}
                        onClick={() =>
                          setHealthProfile((current) => ({
                            ...current,
                            pastSurgeries: current.pastSurgeries.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      value={newSurgery.procedure}
                      onChange={(event) => setNewSurgery((current) => ({ ...current, procedure: event.target.value }))}
                      placeholder="Procedure or operation"
                      maxLength={160}
                    />
                    <Input
                      value={newSurgery.approximateDate}
                      onChange={(event) => setNewSurgery((current) => ({ ...current, approximateDate: event.target.value }))}
                      placeholder="Approximate date"
                      maxLength={80}
                    />
                    <Input
                      value={newSurgery.notes}
                      onChange={(event) => setNewSurgery((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Notes (optional)"
                      maxLength={500}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={addSurgery} disabled={!newSurgery.procedure.trim()}>
                    <Plus className="size-4" /> Add surgery
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* OTHER DETAILS TEXTAREA FOR "all" SECTION */}
          {section === "all" && (
            <div className="space-y-1.5">
              <label htmlFor="medical-details-textarea" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Other relevant medical details
              </label>
              <Textarea
                id="medical-details-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Past surgeries, ongoing treatments, or family medical history relevant for your treating doctor."
                className="rounded-xl text-sm"
              />
            </div>
          )}

          {/* SUBMIT BUTTON FOR "all" SECTION */}
          {section === "all" && (
            <div>
              <Button type="submit" disabled={pending} className="w-full sm:w-auto font-medium">
                {pending ? "Saving…" : "Review changes"}
              </Button>
            </div>
          )}
        </>
      )}

      {/* State Feedback Alerts */}
      {state.error && (
        <Alert variant="destructive" className="rounded-xl">
          <AlertTitle>Could not save medical history</AlertTitle>
          <AlertDescription className="text-xs">{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert className="rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <AlertTitle className="text-xs font-semibold">Saved</AlertTitle>
          <AlertDescription className="text-xs">{state.success}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
