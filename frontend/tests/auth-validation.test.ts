import { describe, expect, it } from "vitest";
import { doctorOnboardingSchema, patientOnboardingSchema, signInSchema, signUpSchema } from "../lib/validation/auth";

describe("Phase 3 auth validation", () => {
  it("accepts and normalizes a valid patient sign-up", () => {
    expect(signUpSchema.parse({ fullName: "Asha Rao", email: "ASHA@example.com", password: "a-secure-password", passwordConfirmation: "a-secure-password", role: "patient" }).email).toBe("asha@example.com");
  });
  it("rejects weak, mismatched, malformed, and invalid-role sign-ups", () => {
    expect(signUpSchema.safeParse({ fullName: "A", email: "bad", password: "short", passwordConfirmation: "different", role: "admin" }).success).toBe(false);
  });
  it("validates sign-in emails", () => {
    expect(signInSchema.safeParse({ email: "not-an-email", password: "password" }).success).toBe(false);
  });
  it("validates patient details", () => {
    expect(patientOnboardingSchema.safeParse({ fullName: "Asha Rao", phone: "+14155552671", dateOfBirth: "1990-04-20" }).success).toBe(true);
    expect(patientOnboardingSchema.safeParse({ fullName: "A", phone: "555-0100", dateOfBirth: "2090-04-20" }).success).toBe(false);
  });
  it("validates doctor details and IANA timezones", () => {
    const valid = { fullName: "Dr. Asha Rao", specialty: "Cardiology", clinicName: "River Clinic", experienceYears: 8, biography: "A board-certified physician focused on preventive care and clear communication.", timezone: "Asia/Kolkata" };
    expect(doctorOnboardingSchema.safeParse(valid).success).toBe(true);
    expect(doctorOnboardingSchema.safeParse({ ...valid, timezone: "Not/A_Timezone", experienceYears: 81 }).success).toBe(false);
  });
});
