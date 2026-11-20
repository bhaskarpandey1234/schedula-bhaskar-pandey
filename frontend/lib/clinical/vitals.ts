export type PatientVitals = {
  gender?: string;
  bloodGroup?: string;
  height?: string;
  weight?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
  primaryContactRelation?: string;
};

export type CurrentConcern = { description: string; onset: string };
export type PastSurgery = { procedure: string; approximateDate: string; notes: string };
export type SelfReportedMedication = { name: string; dosage: string; frequency: string; duration: string; startDate: string; source: string };
export type PatientHealthProfile = {
  currentConcerns: CurrentConcern[];
  pastSurgeries: PastSurgery[];
  selfReportedMedications: SelfReportedMedication[];
};

export type ParsedMedicalDetails = { vitals: PatientVitals; notes: string; healthProfile: PatientHealthProfile };

const emptyHealthProfile = (): PatientHealthProfile => ({ currentConcerns: [], pastSurgeries: [], selfReportedMedications: [] });

function stringValue(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readArray<T>(value: unknown, mapper: (item: Record<string, unknown>) => T | null, maximum = 20): T[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maximum).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const parsed = mapper(item as Record<string, unknown>);
    return parsed ? [parsed] : [];
  });
}

export function normalizeHealthProfile(value: unknown): PatientHealthProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyHealthProfile();
  const profile = value as Record<string, unknown>;
  return {
    currentConcerns: readArray(profile.currentConcerns, (item) => {
      const description = stringValue(item.description, 300);
      return description ? { description, onset: stringValue(item.onset, 80) } : null;
    }, 10),
    pastSurgeries: readArray(profile.pastSurgeries, (item) => {
      const procedure = stringValue(item.procedure, 160);
      return procedure ? { procedure, approximateDate: stringValue(item.approximateDate, 80), notes: stringValue(item.notes, 500) } : null;
    }, 10),
    selfReportedMedications: readArray(profile.selfReportedMedications, (item) => {
      const name = stringValue(item.name, 120);
      return name ? {
        name,
        dosage: stringValue(item.dosage, 120),
        frequency: stringValue(item.frequency, 120),
        duration: stringValue(item.duration, 120),
        startDate: stringValue(item.startDate, 80),
        source: stringValue(item.source, 160),
      } : null;
    }, 20),
  };
}

export function parseMedicalDetails(details: string | null | undefined): ParsedMedicalDetails {
  if (!details || !details.trim()) return { vitals: {}, notes: "", healthProfile: emptyHealthProfile() };
  const trimmed = details.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const payload = parsed as Record<string, unknown>;
        const vitals: PatientVitals = {
          gender: typeof payload.gender === "string" ? payload.gender : undefined,
          bloodGroup: typeof payload.bloodGroup === "string" ? payload.bloodGroup : undefined,
          height: typeof payload.height === "string" ? payload.height : undefined,
          weight: typeof payload.weight === "string" ? payload.weight : undefined,
          primaryContactName: typeof payload.primaryContactName === "string" ? payload.primaryContactName : undefined,
          primaryContactPhone: typeof payload.primaryContactPhone === "string" ? payload.primaryContactPhone : undefined,
          primaryContactRelation: typeof payload.primaryContactRelation === "string" ? payload.primaryContactRelation : undefined,
        };
        return { vitals, notes: typeof payload.notes === "string" ? payload.notes : "", healthProfile: normalizeHealthProfile(payload.healthProfile) };
      }
    } catch {
      // Preserve existing plain-text clinical notes.
    }
  }
  return { vitals: {}, notes: trimmed, healthProfile: emptyHealthProfile() };
}

export function serializeMedicalDetails(vitals: PatientVitals, notes: string, healthProfile = emptyHealthProfile()): string {
  const normalizedProfile = normalizeHealthProfile(healthProfile);
  const hasVitals = Object.values(vitals).some((value) => typeof value === "string" && value.trim().length > 0);
  const cleanNotes = notes.trim();
  const hasHealthProfile = normalizedProfile.currentConcerns.length > 0 || normalizedProfile.pastSurgeries.length > 0 || normalizedProfile.selfReportedMedications.length > 0;
  if (!hasVitals && !cleanNotes && !hasHealthProfile) return "";
  if (!hasVitals && !hasHealthProfile) return cleanNotes;
  const payload: Record<string, unknown> = {};
  if (vitals.gender?.trim()) payload.gender = vitals.gender.trim();
  if (vitals.bloodGroup?.trim()) payload.bloodGroup = vitals.bloodGroup.trim();
  if (vitals.height?.trim()) payload.height = vitals.height.trim();
  if (vitals.weight?.trim()) payload.weight = vitals.weight.trim();
  if (vitals.primaryContactName?.trim()) payload.primaryContactName = vitals.primaryContactName.trim();
  if (vitals.primaryContactPhone?.trim()) payload.primaryContactPhone = vitals.primaryContactPhone.trim();
  if (vitals.primaryContactRelation?.trim()) payload.primaryContactRelation = vitals.primaryContactRelation.trim();
  if (cleanNotes) payload.notes = cleanNotes;
  if (hasHealthProfile) payload.healthProfile = normalizedProfile;
  return JSON.stringify(payload);
}

export function calculateAge(dobString: string | null | undefined): string {
  if (!dobString) return "—";
  const dob = new Date(dobString);
  if (Number.isNaN(dob.getTime())) return "—";
  const ageDate = new Date(Date.now() - dob.getTime());
  return `${Math.abs(ageDate.getUTCFullYear() - 1970)} Years`;
}

export function formatPatientId(patientId: string): string {
  return `SCH-${patientId.replace(/-/g, "").toUpperCase().slice(0, 8)}`;
}

export function formatDateString(dateString: string | null | undefined, timezone = "UTC"): string {
  if (!dateString) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: timezone }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}
