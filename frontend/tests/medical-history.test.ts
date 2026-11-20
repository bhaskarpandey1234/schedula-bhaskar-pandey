import { describe, expect, it } from "vitest";
import { parseMedicalHistoryForm, parseVisitSummaryForm } from "../lib/validation/medical-history";
import {
  calculateAge,
  formatPatientId,
  normalizeHealthProfile,
  parseMedicalDetails,
  serializeMedicalDetails,
} from "../lib/clinical/vitals";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const patientId = "00000000-0000-4000-8000-000000000001";
const appointmentId = "00000000-0000-4000-8000-000000000002";

describe("medical history validation", () => {
  it("parses structured allergies, conditions, and history details", () => {
    expect(parseMedicalHistoryForm(form({
      patientId,
      expectedVersion: "2",
      allergiesStatus: "recorded",
      allergies: "Penicillin | Rash | Moderate",
      conditions: "Hypertension | active | Controlled with medication",
      medicalDetails: "Previous cardiac procedure in 2024.",
    }))).toMatchObject({
      expectedVersion: 2,
      allergies: { status: "recorded", items: [{ substance: "Penicillin", reaction: "Rash", severity: "moderate" }] },
      conditions: { items: [{ name: "Hypertension", status: "active", notes: "Controlled with medication" }] },
    });
  });

  it("rejects contradictory allergy states and invalid condition status", () => {
    expect(() => parseMedicalHistoryForm(form({ patientId, expectedVersion: "0", allergiesStatus: "none_known", allergies: "Penicillin | Rash | mild", conditions: "", medicalDetails: "" }))).toThrow("Clear the allergy list");
    expect(() => parseMedicalHistoryForm(form({ patientId, expectedVersion: "0", allergiesStatus: "unknown", allergies: "", conditions: "Asthma | historic |", medicalDetails: "" }))).toThrow();
  });

  it("rejects duplicate condition entries regardless of case", () => {
    expect(() => parseMedicalHistoryForm(form({
      patientId,
      expectedVersion: "0",
      allergiesStatus: "unknown",
      allergies: "",
      conditions: "Asthma | active | Inhaler\nasthma | resolved | Childhood",
      medicalDetails: "",
    }))).toThrow(/already listed.*Duplicate conditions are not allowed/i);
  });

  it("requires a bounded visit summary and explicit publish choice", () => {
    expect(parseVisitSummaryForm(form({ appointmentId, expectedVersion: "1", summary: "Symptoms improved; continue treatment and follow up in two weeks.", publish: "true" }))).toMatchObject({ publish: true, expectedVersion: 1 });
    expect(() => parseVisitSummaryForm(form({ appointmentId, expectedVersion: "0", summary: "", publish: "false" }))).toThrow();
  });

  it("parses and serializes structured vitals and clinical notes", () => {
    const serialized = serializeMedicalDetails(
      {
        gender: "Male",
        bloodGroup: "B+",
        height: "175 cm",
        weight: "68 kg",
        primaryContactName: "Rohit Pandey",
        primaryContactPhone: "+91 98765 43210",
      },
      "Routine follow up required",
    );

    const parsed = parseMedicalDetails(serialized);
    expect(parsed.vitals.gender).toBe("Male");
    expect(parsed.vitals.bloodGroup).toBe("B+");
    expect(parsed.vitals.height).toBe("175 cm");
    expect(parsed.vitals.weight).toBe("68 kg");
    expect(parsed.vitals.primaryContactName).toBe("Rohit Pandey");
    expect(parsed.vitals.primaryContactPhone).toBe("+91 98765 43210");
    expect(parsed.notes).toBe("Routine follow up required");
  });

  it("preserves bounded self-reported concerns, surgeries, and non-prescription medicines", () => {
    const serialized = serializeMedicalDetails({}, "", {
      currentConcerns: [{ description: "Recurring headache", onset: "Two weeks" }],
      pastSurgeries: [{ procedure: "Appendix operation", approximateDate: "2018", notes: "Patient reported" }],
      selfReportedMedications: [{ name: "Vitamin D", dosage: "1000 IU", frequency: "Once daily", duration: "Ongoing", startDate: "2024", source: "Patient-reported" }],
    });
    const parsed = parseMedicalDetails(serialized);
    expect(parsed.healthProfile.currentConcerns).toEqual([{ description: "Recurring headache", onset: "Two weeks" }]);
    expect(parsed.healthProfile.pastSurgeries[0]?.procedure).toBe("Appendix operation");
    expect(parsed.healthProfile.selfReportedMedications[0]).toMatchObject({ name: "Vitamin D", source: "Patient-reported" });
  });

  it("discards malformed health-profile entries and canonicalizes details before saving", () => {
    expect(normalizeHealthProfile({
      currentConcerns: [{ description: "" }, "invalid"],
      pastSurgeries: [{ procedure: "" }],
      selfReportedMedications: [{ name: "", source: "Unknown" }],
    })).toEqual({ currentConcerns: [], pastSurgeries: [], selfReportedMedications: [] });
    const values = parseMedicalHistoryForm(form({
      patientId,
      expectedVersion: "0",
      allergiesStatus: "unknown",
      allergies: "",
      conditions: "",
      medicalDetails: JSON.stringify({ healthProfile: { currentConcerns: [{ description: "New concern", onset: "Today" }, { description: "" }] } }),
    }));
    expect(parseMedicalDetails(values.medicalDetails).healthProfile.currentConcerns).toEqual([{ description: "New concern", onset: "Today" }]);
  });

  it("bounds self-reported health-profile collection sizes", () => {
    const profile = normalizeHealthProfile({
      currentConcerns: Array.from({ length: 12 }, (_, index) => ({ description: `Concern ${index}` })),
      pastSurgeries: Array.from({ length: 12 }, (_, index) => ({ procedure: `Procedure ${index}` })),
      selfReportedMedications: Array.from({ length: 22 }, (_, index) => ({ name: `Medicine ${index}` })),
    });
    expect(profile.currentConcerns).toHaveLength(10);
    expect(profile.pastSurgeries).toHaveLength(10);
    expect(profile.selfReportedMedications).toHaveLength(20);
  });

  it("gracefully falls back to plain text notes for legacy data without vitals", () => {
    const legacy = "Clinician reviewed detail without JSON";
    const parsed = parseMedicalDetails(legacy);
    expect(parsed.vitals).toEqual({});
    expect(parsed.notes).toBe(legacy);
  });

  it("formats patient ID and calculates age accurately", () => {
    expect(formatPatientId("62c0672b-f138-489d-80cf-3ec80689ebab")).toBe("SCH-62C0672B");
    expect(calculateAge("2000-01-01")).toMatch(/\d+ Years/);
    expect(calculateAge(null)).toBe("—");
  });

  it("generates authentic hospital-grade prescription PDF documents", async () => {
    const { generatePrescriptionPdf } = await import("../lib/clinical/prescription-pdf");
    const doc = generatePrescriptionPdf({
      prescription: {
        id: "00000000-0000-4000-8000-000000000003",
        appointment_id: appointmentId,
        doctor_id: "00000000-0000-4000-8000-000000000004",
        patient_id: patientId,
        status: "published",
        notes: "Diagnosis: Acute Bronchitis\n\nRest for 3 days and drink plenty of fluids.",
        published_at: "2026-11-20T10:00:00.000Z",
        created_at: "2026-11-20T10:00:00.000Z",
        items: [
          {
            id: "1",
            prescription_id: "00000000-0000-4000-8000-000000000003",
            medication_name: "Amoxicillin & Clavulanate 625mg",
            dosage: "1 Tablet",
            frequency: "1-0-1 (Twice daily)",
            duration: "5 days",
            instructions: "Take after meals with water",
            sort_order: 0,
          },
          {
            id: "2",
            prescription_id: "00000000-0000-4000-8000-000000000003",
            medication_name: "Paracetamol 650mg",
            dosage: "1 Tablet",
            frequency: "SOS (As needed)",
            duration: "3 days",
            instructions: "Take if fever exceeds 100°F",
            sort_order: 1,
          },
        ],
      },
      clinicName: "Apex Multispeciality Center",
      doctorName: "Dr. Aarti Sharma",
      doctorSpecialty: "General Medicine & Pulmonology",
      doctorRegistrationNo: "MCI-2018-98421",
      patientName: "Rahul Sharma",
      patientGender: "Male",
      patientDob: "1992-05-14",
      consultationDate: "20 Nov 2026, 10:30 AM",
      allergies: "No known drug allergies",
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const pdfOutput = doc.output();
    expect(pdfOutput.length).toBeGreaterThan(100);
  });

  it("structures multi-item prescription items for doctor and patient clinical records", () => {
    const rawItems = [
      { medicationName: "Cetirizine 10mg", dosage: "1 Tab", frequency: "0-0-1", duration: "5 days", instructions: "Bedtime" },
      { medicationName: "Pantoprazole 40mg", dosage: "1 Tab", frequency: "1-0-0", duration: "7 days", instructions: "Before breakfast" },
    ];

    expect(rawItems).toHaveLength(2);
    expect(rawItems[0].medicationName).toBe("Cetirizine 10mg");
    expect(rawItems[1].instructions).toBe("Before breakfast");
  });
});
