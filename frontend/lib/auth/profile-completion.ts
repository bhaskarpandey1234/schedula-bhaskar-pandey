import type { Role } from "@/lib/validation/auth";

export type ProfileMissingField =
  | "email"
  | "fullName"
  | "phone"
  | "dateOfBirth"
  | "specialty"
  | "clinicName"
  | "experienceYears"
  | "biography"
  | "timezone"
  | "consultationFee";

export type ProfileCompletion = {
  complete: boolean;
  missingFields: ProfileMissingField[];
};

export const profileFieldLabels: Record<ProfileMissingField, string> = {
  email: "a verified email address",
  fullName: "your full name",
  phone: "an international phone number",
  dateOfBirth: "your date of birth",
  specialty: "your specialty",
  clinicName: "your clinic name",
  experienceYears: "your years of experience",
  biography: "a professional biography",
  timezone: "your timezone",
  consultationFee: "your consultation fee",
};

const phonePattern = /^\+[1-9]\d{7,14}$/;

function validTimezone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validDateOfBirth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  const oldest = new Date(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate());
  return !Number.isNaN(date.getTime()) && date <= now && date >= oldest;
}

export function evaluateProfileCompletion(role: Role, email: string | null | undefined, details: Record<string, unknown> | null | undefined): ProfileCompletion {
  const missing: ProfileMissingField[] = [];
  if (!email?.trim()) missing.push("email");
  if (!String(details?.full_name ?? "").trim()) missing.push("fullName");

  if (role === "patient") {
    if (!phonePattern.test(String(details?.phone ?? ""))) missing.push("phone");
    if (!validDateOfBirth(details?.date_of_birth)) missing.push("dateOfBirth");
  } else {
    if (!phonePattern.test(String(details?.phone ?? ""))) missing.push("phone");
    if (!String(details?.specialty ?? "").trim()) missing.push("specialty");
    if (!String(details?.clinic_name ?? "").trim()) missing.push("clinicName");
    if (!Number.isInteger(details?.experience_years) || Number(details?.experience_years) < 0) missing.push("experienceYears");
    if (String(details?.biography ?? "").trim().length < 20) missing.push("biography");
    if (!validTimezone(details?.timezone)) missing.push("timezone");
    if (!Number.isInteger(details?.consultation_fee_minor) || Number(details?.consultation_fee_minor) <= 0 || details?.consultation_currency !== "INR") missing.push("consultationFee");
  }

  return { complete: missing.length === 0, missingFields: missing };
}

export function missingFieldLabels(fields: ProfileMissingField[]) {
  return fields.map((field) => profileFieldLabels[field]);
}
