import { describe, expect, it } from "vitest";
import { evaluateProfileCompletion } from "../lib/auth/profile-completion";

const patient = { full_name: "A Patient", phone: "+919876543210", date_of_birth: "1990-04-20" };
const doctor = { full_name: "Dr. Rao", phone: "+919876543211", specialty: "Cardiology", clinic_name: "River Clinic", experience_years: 8, biography: "A physician with a detailed professional biography.", timezone: "Asia/Kolkata", consultation_fee_minor: 100000, consultation_currency: "INR" };

describe("profile completeness", () => {
  it("accepts a complete patient profile", () => expect(evaluateProfileCompletion("patient", "patient@example.test", patient)).toEqual({ complete: true, missingFields: [] }));
  it("reports patient contact and date fields", () => {
    const result = evaluateProfileCompletion("patient", "", { ...patient, phone: "123", date_of_birth: "2099-01-01" });
    expect(result.missingFields).toEqual(expect.arrayContaining(["email", "phone", "dateOfBirth"]));
  });
  it("accepts a complete doctor profile", () => expect(evaluateProfileCompletion("doctor", "doctor@example.test", doctor)).toEqual({ complete: true, missingFields: [] }));
  it("requires every doctor scheduling field, including phone and fee", () => {
    const result = evaluateProfileCompletion("doctor", "doctor@example.test", { ...doctor, phone: null, biography: "short", timezone: "Not/AZone", consultation_fee_minor: null });
    expect(result.missingFields).toEqual(expect.arrayContaining(["phone", "biography", "timezone", "consultationFee"]));
  });
});
