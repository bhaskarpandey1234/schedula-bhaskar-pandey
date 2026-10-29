"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { careAreasForSpecialty } from "@/lib/discovery/care-areas";

export function CareAreaCarousel({ specialties }: { specialties: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const slides = specialties.slice(0, 8);

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.82, behavior: "smooth" }), 4500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const move = (direction: number) => ref.current?.scrollBy({ left: direction * (ref.current.clientWidth * 0.82), behavior: "smooth" });

  return <div>
    <div ref={ref} role="region" aria-label="Browse care areas" aria-roledescription="carousel" tabIndex={0} className="flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {slides.map((specialty) => <a key={specialty} href={`/doctors?specialty=${encodeURIComponent(specialty)}`} className="group w-[min(82vw,22rem)] shrink-0 snap-start rounded-2xl border bg-background p-5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-sm font-medium text-primary">Care area</span>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">{specialty}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{careAreasForSpecialty(specialty).join(" · ")}</p>
        <span className="mt-5 inline-flex text-sm font-medium text-foreground group-hover:text-primary">Explore care <span aria-hidden="true" className="ml-1">→</span></span>
      </a>)}
    </div>
    <div className="mt-3 flex justify-end gap-2"><Button size="icon" variant="outline" aria-label="Previous care areas" onClick={() => move(-1)}><ChevronLeft /></Button><Button size="icon" variant="outline" aria-label="Next care areas" onClick={() => move(1)}><ChevronRight /></Button></div>
  </div>;
}
