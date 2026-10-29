"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { DoctorDirectoryCard } from "@/components/doctor-directory-card";
import { Button } from "@/components/ui/button";
import type { DoctorDirectoryRecord } from "@/lib/discovery/types";

type DemoDoctor = {
  name: string;
  specialty: string;
  clinic: string;
  experience: string;
  focus: string;
};

const demoDoctors: DemoDoctor[] = [
  {
    name: "Dr. Anika Rao",
    specialty: "Cardiology",
    clinic: "Heart & Wellness Clinic",
    experience: "12 years",
    focus: "preventive heart care",
  },
  {
    name: "Dr. Maya Kapoor",
    specialty: "Dermatology",
    clinic: "Clear Skin Centre",
    experience: "9 years",
    focus: "skin and hair health",
  },
  {
    name: "Dr. Rohan Mehta",
    specialty: "General Medicine",
    clinic: "CityCare Medical",
    experience: "15 years",
    focus: "everyday health concerns",
  },
  {
    name: "Dr. Neha Iyer",
    specialty: "Pediatrics",
    clinic: "Little Steps Hospital",
    experience: "11 years",
    focus: "child wellness visits",
  },
];

function demoDoctorToRecord(d: DemoDoctor): DoctorDirectoryRecord {
  const years = parseInt(d.experience, 10) || 10;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return {
    doctor_id: `demo-${d.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    full_name: d.name,
    specialty: d.specialty,
    clinic_name: d.clinic,
    experience_years: years,
    available_dates: [today, tomorrow],
  };
}

export function DoctorCarousel({
  doctors,
  showDemo = false,
}: {
  doctors: DoctorDirectoryRecord[];
  showDemo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const useDemo = showDemo || !doctors.length;
  const slideRecords: DoctorDirectoryRecord[] = useDemo
    ? demoDoctors.map(demoDoctorToRecord)
    : doctors.slice(0, 8);

  useEffect(() => {
    if (slideRecords.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = window.setInterval(
      () => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.82, behavior: "smooth" }),
      6000
    );
    return () => window.clearInterval(timer);
  }, [slideRecords.length]);

  const move = (direction: number) =>
    ref.current?.scrollBy({
      left: direction * (ref.current.clientWidth * 0.82),
      behavior: "smooth",
    });

  return (
    <div>
      <div
        ref={ref}
        role="region"
        aria-label="Doctor profiles"
        aria-roledescription="carousel"
        tabIndex={0}
        className="flex snap-x gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slideRecords.map((doctor) => (
          <div
            key={doctor.doctor_id}
            className="w-[min(92vw,34rem)] sm:w-[32rem] lg:w-[36rem] shrink-0 snap-start"
          >
            <DoctorDirectoryCard doctor={doctor} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label="Previous doctors"
          onClick={() => move(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Next doctors"
          onClick={() => move(1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
