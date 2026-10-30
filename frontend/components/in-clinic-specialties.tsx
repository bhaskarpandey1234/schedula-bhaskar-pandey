"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export type InClinicSpecialtyItem = {
  id: string;
  specialty: string;
  displayTitle: string;
  description: string;
  imageUrl: string;
  href: string;
};

export const IN_CLINIC_SPECIALTIES: InClinicSpecialtyItem[] = [
  {
    id: "dentist",
    specialty: "Dentist",
    displayTitle: "Dentist",
    description: "Teething troubles? Schedule a dental checkup",
    imageUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Dentist",
  },
  {
    id: "gynecology",
    specialty: "Gynecology",
    displayTitle: "Gynecologist/Obstetrician",
    description: "Explore for women's health, pregnancy and infertility treatments",
    imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Gynecology",
  },
  {
    id: "dietitian",
    specialty: "Dietitian",
    displayTitle: "Dietitian/Nutrition",
    description: "Get guidance on eating right, weight management and sports nutrition",
    imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Dietitian",
  },
  {
    id: "physiotherapy",
    specialty: "Physiotherapy",
    displayTitle: "Physiotherapist",
    description: "Pulled a muscle? Get it treated by a trained physiotherapist",
    imageUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Physiotherapy",
  },
  {
    id: "general-medicine",
    specialty: "General Medicine",
    displayTitle: "General Physician",
    description: "Cold, fever, headaches, chronic illness or routine checkups",
    imageUrl: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=General+Medicine",
  },
  {
    id: "pediatrics",
    specialty: "Pediatrics",
    displayTitle: "Pediatrician",
    description: "Child wellness, gentle care, vaccinations and fever treatment",
    imageUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Pediatrics",
  },
  {
    id: "dermatology",
    specialty: "Dermatology",
    displayTitle: "Dermatologist",
    description: "Specialized care for acne, eczema, hair fall and glowing skin",
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Dermatology",
  },
  {
    id: "orthopedics",
    specialty: "Orthopedic Surgery",
    displayTitle: "Orthopedic Surgeon",
    description: "Joint pain, knee stiffness, spine health and bone recovery",
    imageUrl: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=600",
    href: "/doctors?specialty=Orthopedic+Surgery",
  },
];

export function InClinicSpecialties() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      ref.current?.scrollBy({
        left: ref.current.clientWidth * 0.75,
        behavior: "smooth",
      });
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const move = (direction: number) => {
    ref.current?.scrollBy({
      left: direction * (ref.current.clientWidth * 0.75),
      behavior: "smooth",
    });
  };

  return (
    <section className="py-12 sm:py-16 bg-surface-muted/40 border-b border-border/60">
      <div className="w-full">
        {/* Schedula specialty header */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
              Book an appointment for an in-clinic consultation
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Find experienced doctors across all specialties
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              size="icon"
              variant="outline"
              aria-label="Previous specialties"
              className="size-9 rounded-full bg-white hover:bg-slate-100 shadow-sm"
              onClick={() => move(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Next specialties"
              className="size-9 rounded-full bg-white hover:bg-slate-100 shadow-sm"
              onClick={() => move(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

              {/* Horizontal specialty cards */}
        <div
          ref={ref}
          role="region"
          aria-label="In-clinic specialties carousel"
          tabIndex={0}
          className="flex snap-x gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {IN_CLINIC_SPECIALTIES.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group flex w-[min(82vw,17.5rem)] sm:w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Photo on Top */}
              <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                <Image
                  src={item.imageUrl}
                  alt={item.displayTitle}
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 85vw, 300px"
                />
              </div>

              {/* Title and description */}
              <div className="flex flex-1 flex-col justify-between p-4 space-y-1.5">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-[#1D2153] transition-colors group-hover:text-primary">
                    {item.displayTitle}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                </div>

                <div className="pt-2 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Book Clinic Visit →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
