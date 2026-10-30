import { z } from "zod";
import { doctorOnboardingSchema } from "./auth";

export const doctorProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: doctorOnboardingSchema.shape.phone,
  specialty: doctorOnboardingSchema.shape.specialty,
  clinicName: doctorOnboardingSchema.shape.clinicName,
  experienceYears: doctorOnboardingSchema.shape.experienceYears,
  biography: doctorOnboardingSchema.shape.biography,
  timezone: doctorOnboardingSchema.shape.timezone,
  consultationFee: doctorOnboardingSchema.shape.consultationFee,
});

export type DoctorProfileInput = z.infer<typeof doctorProfileSchema>;
