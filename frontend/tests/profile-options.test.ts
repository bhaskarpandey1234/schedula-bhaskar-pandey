import { describe, expect, it } from "vitest";
import { generateDoctorBio, specialtyOptions } from "../lib/profile-options";

describe("profile helpers", () => {
  it("includes an Other specialty fallback", () => {
    expect(specialtyOptions).toContain("Other");
  });

  it("generates an editable local bio from profile details", () => {
    const bio = generateDoctorBio({ specialty: "Cardiology", clinicName: "River Clinic", experienceYears: 8 });
    expect(bio).toContain("Cardiology");
    expect(bio).toContain("River Clinic");
    expect(bio).toContain("8 years");
  });
});
