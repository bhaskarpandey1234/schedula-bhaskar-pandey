import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DoctorAvatar } from "../components/doctor-avatar";
import { DoctorDirectoryCard } from "../components/doctor-directory-card";
import { getDummyDoctors } from "../lib/discovery/mock-doctors";
import type { DoctorDirectoryRecord } from "../lib/discovery/types";

const realDoctor: DoctorDirectoryRecord = {
  doctor_id: "real-doctor",
  full_name: "Dr. Real Doctor",
  specialty: "Cardiology",
  clinic_name: "Real Clinic",
  experience_years: 8,
  available_dates: [],
};

describe("doctor profile images", () => {
  it("assigns stable real portraits to every dummy doctor", () => {
    const first = getDummyDoctors();
    const second = getDummyDoctors();
    expect(first.every((doctor) => doctor.profile_image_url?.startsWith("https://images.unsplash.com/")))
      .toBe(true);
    expect(first.map((doctor) => doctor.profile_image_url))
      .toEqual(second.map((doctor) => doctor.profile_image_url));
  });

  it("uses the local illustration when a real doctor has no image", () => {
    const html = renderToStaticMarkup(React.createElement(DoctorAvatar, { name: realDoctor.full_name }));
    expect(html).toContain("default-doctor-avatar.png");
    expect(html).toContain('alt="Dr. Real Doctor profile"');
  });

  it("uses an explicit dummy portrait instead of the fallback", () => {
    const doctor = getDummyDoctors()[0];
    const html = renderToStaticMarkup(React.createElement(DoctorDirectoryCard, { doctor }));
    expect(html).toContain(new URL(doctor.profile_image_url!).pathname);
    expect(html).not.toContain("default-doctor-avatar.png");
  });
});
