"use client";

import { ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { DoctorDirectoryCard } from "@/components/doctor-directory-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { DoctorDirectoryRecord } from "@/lib/discovery/types";

type DemoDoctor = { name: string; specialty: string; clinic: string; experience: string; focus: string };

const demoDoctors: DemoDoctor[] = [
  { name: "Dr. Anika Rao", specialty: "Cardiology", clinic: "Heart & Wellness Clinic", experience: "12 years", focus: "preventive heart care" },
  { name: "Dr. Maya Kapoor", specialty: "Dermatology", clinic: "Clear Skin Centre", experience: "9 years", focus: "skin and hair health" },
  { name: "Dr. Rohan Mehta", specialty: "General Medicine", clinic: "CityCare Medical", experience: "15 years", focus: "everyday health concerns" },
  { name: "Dr. Neha Iyer", specialty: "Pediatrics", clinic: "Little Steps Hospital", experience: "11 years", focus: "child wellness visits" },
];

function DemoDoctorCard({ doctor }: { doctor: DemoDoctor }) {
  return <Card className="flex h-full flex-col">
    <CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{doctor.name}</CardTitle><p className="mt-2 text-sm font-medium text-primary">{doctor.specialty}</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{doctor.experience}</span></div><p className="flex items-center gap-2 pt-2 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />{doctor.clinic}</p></CardHeader>
    <CardContent className="flex-1"><p className="text-sm text-muted-foreground">Focused on {doctor.focus} with thoughtful, patient-first care.</p></CardContent>
    <CardFooter><Button asChild className="w-full"><Link href="/doctors"><Search className="size-4" aria-hidden="true" />Browse profiles</Link></Button></CardFooter>
  </Card>;
}

export function DoctorCarousel({ doctors, showDemo = false }: { doctors: DoctorDirectoryRecord[]; showDemo?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const useDemo = showDemo || !doctors.length;
  const slides = useDemo ? demoDoctors : doctors.slice(0, 8);

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.82, behavior: "smooth" }), 5000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const move = (direction: number) => ref.current?.scrollBy({ left: direction * (ref.current.clientWidth * 0.82), behavior: "smooth" });

  return <div>
    <div ref={ref} role="region" aria-label="Doctor profiles" aria-roledescription="carousel" tabIndex={0} className="flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {slides.map((doctor) => <div key={useDemo ? (doctor as DemoDoctor).name : (doctor as DoctorDirectoryRecord).doctor_id} className="w-[min(86vw,20rem)] shrink-0 snap-start">{useDemo ? <DemoDoctorCard doctor={doctor as DemoDoctor} /> : <DoctorDirectoryCard doctor={doctor as DoctorDirectoryRecord} />}</div>)}
    </div>
    <div className="mt-3 flex justify-end gap-2"><Button size="icon" variant="outline" aria-label="Previous doctors" onClick={() => move(-1)}><ChevronLeft /></Button><Button size="icon" variant="outline" aria-label="Next doctors" onClick={() => move(1)}><ChevronRight /></Button></div>
  </div>;
}
