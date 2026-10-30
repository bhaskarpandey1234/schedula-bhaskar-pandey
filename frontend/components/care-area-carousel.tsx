"use client";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { getCareAreaMeta } from "@/lib/discovery/care-areas";

export function CareAreaCarousel({ specialties }: { specialties: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const slides = specialties.length ? specialties.slice(0, 10) : [];

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = window.setInterval(
      () => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.82, behavior: "smooth" }),
      6000
    );
    return () => window.clearInterval(timer);
  }, [slides.length]);

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
        aria-label="Browse healthcare concerns and conditions"
        aria-roledescription="carousel"
        tabIndex={0}
        className="flex snap-x gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((specialty) => {
          const meta = getCareAreaMeta(specialty);

          return (
            <Link
              key={specialty}
              href={`/doctors?specialty=${encodeURIComponent(specialty)}`}
              className="group flex w-[min(88vw,21rem)] sm:w-[22rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Schedula health concern image banner */}
              <div className="relative h-44 w-full overflow-hidden bg-muted">
                <Image
                  src={meta.imageUrl}
                  alt={meta.concernTitle}
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 360px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

                {/* Specialty Pill Floating Over Image */}
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {meta.title}
                  </span>
                </div>

                {/* Doctor Role Badge on bottom right of image */}
                <div className="absolute bottom-2.5 right-3 text-right">
                  <span className="text-[11px] font-medium text-white/90 drop-shadow-sm">
                    {meta.doctorType}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                <div>
          {/* Health concern heading */}
                  <h3 className="text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary leading-snug">
                    {meta.concernTitle}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {meta.description}
                  </p>

                  {/* Clinical Symptom Chips */}
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {meta.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-border/80 bg-surface-muted/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Action Pathway */}
                <div className="pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-primary">
                  <span className="text-muted-foreground flex items-center gap-1 font-medium">
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                    Verified Doctors
                  </span>
                  <span className="flex items-center gap-1 group-hover:underline">
                    <span>Consult Now</span>
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Showing <strong>{slides.length}</strong> common health concerns with verified specialists
        </span>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label="Previous concerns"
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Next concerns"
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
