import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getDoctorInitials,
  getAvailabilityStatus,
  SplitCardDoctorProposal,
  SlotForwardDoctorProposal,
  InstitutionalDoctorProposal,
  DirectorySearchHeaderProposal,
} from "../components/doctor-card-proposals";
import type { DoctorDirectoryRecord } from "../lib/discovery/types";

const mockDoctor: DoctorDirectoryRecord = {
  doctor_id: "doc-123",
  full_name: "Dr. Sarah Johnson, MD",
  specialty: "Cardiology",
  clinic_name: "City Heart Center",
  experience_years: 12,
  available_dates: ["2026-10-29", "2026-10-30"],
};

describe("doctor initials extraction", () => {
  it("extracts initials correctly for standard titles with and without periods", () => {
    expect(getDoctorInitials("Dr. Sarah Johnson")).toBe("SJ");
    expect(getDoctorInitials("Dr Sarah Johnson")).toBe("SJ");
    expect(getDoctorInitials("Doctor Robert Smith")).toBe("RS");
    expect(getDoctorInitials("Prof. Neha Iyer")).toBe("NI");
    expect(getDoctorInitials("Prof Neha Iyer")).toBe("NI");
  });

  it("cleans medical degrees, academic credentials, and suffixes so they do not pollute initials", () => {
    expect(getDoctorInitials("Dr. Sarah Johnson, MD")).toBe("SJ");
    expect(getDoctorInitials("Dr. Emily Davis, MD, PhD, FACS")).toBe("ED");
    expect(getDoctorInitials("Dr. John Williams Jr.")).toBe("JW");
    expect(getDoctorInitials("Dr. Marcus Welby, DO")).toBe("MW");
    expect(getDoctorInitials("Dr. Robert Smith III")).toBe("RS");
    expect(getDoctorInitials("Prof. Neha Iyer, MBBS, MD")).toBe("NI");
  });

  it("handles case insensitivity, extra whitespace, and single names safely", () => {
    expect(getDoctorInitials("dr. sarah johnson")).toBe("SJ");
    expect(getDoctorInitials("   Dr.   Sarah   Johnson   ")).toBe("SJ");
    expect(getDoctorInitials("Dr. Single")).toBe("SI");
    expect(getDoctorInitials("Dr.")).toBe("DR");
    expect(getDoctorInitials("Dr")).toBe("DR");
    expect(getDoctorInitials("")).toBe("DR");
    expect(getDoctorInitials(null as unknown as string)).toBe("DR");
  });

  it("handles international characters, accented names, and non-Latin scripts safely", () => {
    expect(getDoctorInitials("Dr. Étienne Müller")).toBe("ÉM");
    expect(getDoctorInitials("Dr. Ömer Özdemir")).toBe("ÖÖ");
    expect(getDoctorInitials("Dr. José García")).toBe("JG");
    expect(getDoctorInitials("Prof. Søren Kierkegaard")).toBe("SK");
  });

  it("safely strips parentheses-enclosed credentials and department tags without polluting initials", () => {
    expect(getDoctorInitials("Dr. Sarah Johnson (MD)")).toBe("SJ");
    expect(getDoctorInitials("Dr. Sarah Johnson (Cardiology)")).toBe("SJ");
    expect(getDoctorInitials("Dr. John Doe - Surgery")).toBe("JD");
    expect(getDoctorInitials("Prof. Rajesh Sharma, MBBS, MS, MCh")).toBe("RS");
    expect(getDoctorInitials("Dr. Jane Doe, DNB, FRCS, DM")).toBe("JD");
  });
});

describe("clinical availability status evaluation", () => {
  const refDate = "2026-10-29";

  it("detects same-day availability with emerald variant", () => {
    const status = getAvailabilityStatus(["2026-10-29", "2026-10-31"], refDate);
    expect(status.label).toBe("Available today");
    expect(status.isToday).toBe(true);
    expect(status.variant).toBe("emerald");
  });

  it("normalizes full ISO timestamp strings and whitespace to match today", () => {
    const status = getAvailabilityStatus(["2026-10-29T08:30:00Z"], refDate);
    expect(status.label).toBe("Available today");
    expect(status.isToday).toBe(true);
    expect(status.variant).toBe("emerald");

    const statusSpaced = getAvailabilityStatus(["  2026-10-29  "], refDate);
    expect(statusSpaced.label).toBe("Available today");
    expect(statusSpaced.isToday).toBe(true);
  });

  it("detects next-day availability with sky variant", () => {
    const status = getAvailabilityStatus(["2026-10-30"], refDate);
    expect(status.label).toBe("Next: Tomorrow");
    expect(status.isToday).toBe(false);
    expect(status.variant).toBe("sky");
  });

  it("formats future dates without false 'available today' claim", () => {
    const status = getAvailabilityStatus(["2026-11-15"], refDate);
    expect(status.label).toBe("Next: Nov 15");
    expect(status.isToday).toBe(false);
    expect(status.variant).toBe("neutral");
  });

  it("filters out past dates and accurately evaluates upcoming availability", () => {
    // If an array has past dates, it ignores them and finds the active today date
    const status = getAvailabilityStatus(["2026-10-20", "2026-10-29"], refDate);
    expect(status.label).toBe("Available today");
    expect(status.isToday).toBe(true);
    expect(status.variant).toBe("emerald");
  });

  it("sorts unsorted dates to pick the chronologically earliest upcoming date", () => {
    const status = getAvailabilityStatus(["2026-11-05", "2026-10-30"], refDate);
    expect(status.label).toBe("Next: Tomorrow");
    expect(status.isToday).toBe(false);
    expect(status.variant).toBe("sky");
  });

  it("handles malformed date strings in array without throwing or false matches", () => {
    const status = getAvailabilityStatus(["invalid-string", "2026-99-99", "2026-10-30"], refDate);
    expect(status.label).toBe("Next: Tomorrow");
    expect(status.isToday).toBe(false);
    expect(status.variant).toBe("sky");
  });

  it("handles malformed referenceDate string without throwing RangeError", () => {
    expect(() => getAvailabilityStatus(["2026-10-30"], "not-a-valid-date")).not.toThrow();
  });

  it("handles dates entirely in the past gracefully without claiming past dates as next", () => {
    const status = getAvailabilityStatus(["2026-10-15", "2026-10-20"], refDate);
    expect(status.label).toBe("Check schedule");
    expect(status.isToday).toBe(false);
    expect(status.variant).toBe("neutral");
  });

  it("handles empty availability gracefully without false tomorrow claim", () => {
    const status = getAvailabilityStatus([], refDate);
    expect(status.label).toBe("Check schedule");
    expect(status.isToday).toBe(false);
    expect(status.variant).toBe("neutral");
  });
});

describe("doctor card prototype component rendering & accessibility", () => {
  it("renders SplitCardDoctorProposal with clinical hierarchy, ARIA status, and accessible buttons", () => {
    const html = renderToStaticMarkup(
      React.createElement(SplitCardDoctorProposal, {
        doctor: mockDoctor,
        consultationHours: "09:30 AM – 05:00 PM",
        referenceDate: "2026-10-29",
      })
    );

    expect(html).toContain("Dr. Sarah Johnson, MD");
    expect(html).toContain("Cardiology");
    expect(html).toContain("City Heart Center");
    expect(html).toContain("12 yrs exp");
    expect(html).toContain("Book Appointment");
    expect(html).toContain("More Info");
    expect(html).toContain("09:30 AM – 05:00 PM");
    // Semantic ARIA status
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Availability: Available today"');
    // Screen reader accessible action button labels
    expect(html).toContain('aria-label="Book appointment with Dr. Sarah Johnson, MD"');
    expect(html).toContain('aria-label="View more information about Dr. Sarah Johnson, MD"');
    // Fallback initials avatar
    expect(html).toContain("SJ");
  });

  it("renders SplitCardDoctorProposal safely when doctor fields are empty or partial", () => {
    const partialDoctor = {
      doctor_id: "doc-empty",
      full_name: "",
      specialty: "",
      clinic_name: "",
      experience_years: 0,
      available_dates: [],
    };

    expect(() =>
      renderToStaticMarkup(
        React.createElement(SplitCardDoctorProposal, {
          doctor: partialDoctor,
        })
      )
    ).not.toThrow();

    const html = renderToStaticMarkup(
      React.createElement(SplitCardDoctorProposal, {
        doctor: partialDoctor,
      })
    );
    expect(html).toContain("Physician");
    expect(html).toContain("General Practice");
    expect(html).toContain("0 yrs exp");
  });

  it("renders SplitCardDoctorProposal with custom portrait image and descriptive alt text", () => {
    const html = renderToStaticMarkup(
      React.createElement(SplitCardDoctorProposal, {
        doctor: mockDoctor,
        photoUrl: "https://example.com/portraits/sarah.jpg",
      })
    );

    expect(html).toContain("https://example.com/portraits/sarah.jpg");
    expect(html).toContain('alt="Portrait of Dr. Sarah Johnson, MD"');
  });

  it("renders SlotForwardDoctorProposal with slot chips and accessible link labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(SlotForwardDoctorProposal, {
        doctor: mockDoctor,
        slots: [
          { time: "02:00 PM", capacity: "3 left", slotId: "slot-a" },
          { time: "03:30 PM", capacity: "1 left", slotId: "slot-b" },
        ],
      })
    );

    expect(html).toContain("02:00 PM");
    expect(html).toContain("3 left");
    expect(html).toContain('aria-label="Book appointment at 02:00 PM with Dr. Sarah Johnson, MD (3 left)"');
    expect(html).toContain("Book Next (02:00 PM)");
    expect(html).toContain("Full Profile");
    expect(html).toContain("Verified Physician");
  });

  it("renders SlotForwardDoctorProposal truthfully when no slots are available today", () => {
    const html = renderToStaticMarkup(
      React.createElement(SlotForwardDoctorProposal, {
        doctor: mockDoctor,
        slots: [], // Empty slots passed explicitly
      })
    );

    expect(html).toContain("No remaining slots today");
    expect(html).toContain("View Schedule");
    // Must NOT contain fabricated default slots
    expect(html).not.toContain("09:30 AM");
    expect(html).not.toContain("2 left");
  });

  it("renders InstitutionalDoctorProposal with academic prestige elements, photo, and accessible CTAs", () => {
    const html = renderToStaticMarkup(
      React.createElement(InstitutionalDoctorProposal, {
        doctor: mockDoctor,
        photoUrl: "https://example.com/portraits/sarah-whitecoat.jpg",
        consultationHours: "Mon – Fri, 08:30 AM – 04:30 PM",
      })
    );

    expect(html).toContain("Department of Cardiology");
    expect(html).toContain("Board Certified");
    expect(html).toContain("Request Appointment");
    expect(html).toContain("Physician Dossier");
    expect(html).toContain("https://example.com/portraits/sarah-whitecoat.jpg");
    expect(html).toContain('alt="Clinical portrait of Dr. Sarah Johnson, MD"');
    expect(html).toContain('aria-label="Request appointment with Dr. Sarah Johnson, MD"');
  });

  it("renders DirectorySearchHeaderProposal with role='search', verified counter, dark mode classes, and filter inputs", () => {
    const html = renderToStaticMarkup(
      React.createElement(DirectorySearchHeaderProposal, {
        totalDoctors: 35,
        searchValue: "Johnson",
        selectedSpecialty: "Cardiology",
        isAvailableTodayOnly: true,
      })
    );

    expect(html).toContain('role="search"');
    expect(html).toContain("35 Verified Physicians");
    expect(html).toContain("Find a Healthcare Specialist");
    expect(html).toContain('placeholder="Search by physician name or symptom..."');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Available Today");
    expect(html).toContain('Query: &quot;Johnson&quot;');
    expect(html).toContain("Specialty: Cardiology");
    // Dark mode classes on badge and native select
    expect(html).toContain("dark:bg-emerald-950/60");
    expect(html).toContain("bg-card text-foreground");
  });
});
