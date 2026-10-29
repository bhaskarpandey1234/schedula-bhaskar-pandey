import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type HeroService = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  bgClass: string;
  badgeClass: string;
  imageUrl: string;
  imageAlt: string;
};

export const HERO_SERVICES: HeroService[] = [
  {
    id: "in-clinic-appointments",
    title: "In-Clinic Appointments",
    subtitle: "Confirmed hospital & clinic visits",
    href: "/doctors",
    bgClass: "bg-[#EDF5FD] hover:bg-[#E2EFFB] border-sky-100",
    badgeClass: "bg-sky-600/10 text-sky-700",
    imageUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=480",
    imageAlt: "In-Clinic Doctor Consultation",
  },
  {
    id: "find-doctors",
    title: "Find Doctors Near You",
    subtitle: "Verified medical specialists",
    href: "/doctors",
    bgClass: "bg-[#EBF9F7] hover:bg-[#DFF5F2] border-teal-100",
    badgeClass: "bg-teal-600/10 text-teal-700",
    imageUrl: "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=480",
    imageAlt: "Find Experienced Doctors Near You",
  },
  {
    id: "medical-specialties",
    title: "12+ Medical Specialties",
    subtitle: "Dentistry, Cardiology & more",
    href: "/doctors",
    bgClass: "bg-[#F2EFFE] hover:bg-[#EAE4FD] border-purple-100",
    badgeClass: "bg-purple-600/10 text-purple-700",
    imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&q=80&w=480",
    imageAlt: "Comprehensive Medical Specialties",
  },
  {
    id: "same-day-slots",
    title: "Same-Day Bookings",
    subtitle: "Real-time doctor calendar slots",
    href: "/doctors",
    bgClass: "bg-[#EBF2F7] hover:bg-[#E2ECF3] border-slate-200",
    badgeClass: "bg-slate-700/10 text-slate-800",
    imageUrl: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=480",
    imageAlt: "Real-time Doctor Appointment Slots",
  },
];

export function HeroServicesCards() {
  return (
    <div className="w-full">
      {/* 4 Pastel Pill Service Cards (Practo Signature Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {HERO_SERVICES.map((service) => (
          <Link
            key={service.id}
            href={service.href}
            className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${service.bgClass}`}
          >
            {/* Top Image Preview with Rounded Container */}
            <div className="relative mb-4 h-44 w-full overflow-hidden rounded-2xl bg-white/70 shadow-inner">
              <Image
                src={service.imageUrl}
                alt={service.imageAlt}
                fill
                unoptimized
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            </div>

            {/* Content Details */}
            <div className="flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-[#1D2153] leading-snug">
                  {service.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  {service.subtitle}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <span>Explore care</span>
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
