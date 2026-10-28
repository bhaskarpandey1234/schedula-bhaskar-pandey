"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DoctorDirectoryCard } from "@/components/doctor-directory-card";
import type { DoctorDirectoryRecord } from "@/lib/discovery/types";

export function DoctorCarousel({ doctors }: { doctors: DoctorDirectoryRecord[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (doctors.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; const timer = window.setInterval(() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.82, behavior: "smooth" }), 5000); return () => window.clearInterval(timer); }, [doctors.length]);
  if (!doctors.length) return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Doctor profiles will appear here when availability is published.</p>;
  const move = (direction: number) => ref.current?.scrollBy({ left: direction * (ref.current.clientWidth * 0.82), behavior: "smooth" });
  return <div><div ref={ref} role="region" aria-label="Doctors with upcoming availability" aria-roledescription="carousel" tabIndex={0} className="flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{doctors.slice(0, 8).map((doctor) => <div key={doctor.doctor_id} className="w-[min(86vw,20rem)] shrink-0 snap-start"><DoctorDirectoryCard doctor={doctor} /></div>)}</div><div className="mt-3 flex justify-end gap-2"><Button size="icon" variant="outline" aria-label="Previous doctors" onClick={() => move(-1)}><ChevronLeft /></Button><Button size="icon" variant="outline" aria-label="Next doctors" onClick={() => move(1)}><ChevronRight /></Button></div></div>;
}
