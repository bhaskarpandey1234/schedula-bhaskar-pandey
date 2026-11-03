import { z } from "zod";

const password = z.string().min(12, "Use at least 12 characters.");

export const signUpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password,
    role: z.enum(["patient", "doctor"]),
  });

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Enter your password."),
});

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const updatePasswordSchema = z
  .object({ password, passwordConfirmation: z.string() })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match.",
  });

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    const today = new Date();
    const oldest = new Date(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate());
    return !Number.isNaN(date.getTime()) && date <= today && date >= oldest;
  }, "Date of birth must be in the past and within 120 years.");

export const patientOnboardingSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(160),
  countryCode: z.enum(["+91", "+1", "+44", "+65"], "Select your country code."),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number, such as +14155552671."),
  dateOfBirth,
});

const timezone = z.string().trim().refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Use a valid IANA timezone.");

export const doctorOnboardingSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(160),
  countryCode: z.enum(["+91", "+1", "+44", "+65"], "Select your country code."),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number, such as +14155552671."),
  specialty: z.string().trim().min(2).max(100),
  clinicName: z.string().trim().min(2).max(160),
  experienceYears: z.coerce.number().int().min(0).max(80),
  biography: z.string().trim().min(20).max(2000),
  timezone,
  consultationFee: z.coerce.number().finite().min(1, "Enter a consultation fee of at least ₹1.").max(100000, "Consultation fee cannot exceed ₹100,000.").default(1000),
});

export type Role = "patient" | "doctor";
