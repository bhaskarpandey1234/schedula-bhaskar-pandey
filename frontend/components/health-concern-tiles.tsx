"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  SCHEDULA_HEALTH_CONCERNS,
  type SchedulaHealthConcern,
} from "@/lib/discovery/care-areas";

function HealthConcernIllustration({
  type,
}: {
  type: SchedulaHealthConcern["illustrationType"];
}) {
  switch (type) {
    case "pregnancy":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Stylized Reproductive / Maternity Health */}
          <path d="M40 18 C30 18 20 28 20 40 C20 54 34 64 40 68 C46 64 60 54 60 40 C60 28 50 18 40 18 Z" className="fill-pink-200/60 stroke-pink-500" />
          <path d="M40 28 C34 28 30 33 30 39 C30 46 40 54 40 54 C40 54 50 46 50 39 C50 33 46 28 40 28 Z" className="fill-rose-300 stroke-rose-600" />
          <circle cx="28" cy="24" r="5" className="fill-sky-200 stroke-sky-500" />
          <circle cx="52" cy="24" r="5" className="fill-sky-200 stroke-sky-500" />
        </svg>
      );
    case "dermatology":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Facial Skin Profile with Acne / Treatment Marks */}
          <path d="M48 14 C36 14 30 22 28 30 C26 36 28 42 26 46 C24 50 20 52 20 56 C20 62 26 66 36 66 C48 66 58 58 58 42 C58 26 56 14 48 14 Z" className="fill-sky-100 stroke-sky-600" />
          <circle cx="32" cy="42" r="2.5" className="fill-rose-500 stroke-none" />
          <circle cx="38" cy="48" r="2" className="fill-rose-500 stroke-none" />
          <circle cx="30" cy="50" r="1.5" className="fill-rose-400 stroke-none" />
          <circle cx="44" cy="44" r="2" className="fill-rose-400 stroke-none" />
          <path d="M26 46 C32 44 38 42 42 36" className="stroke-sky-400" />
        </svg>
      );
    case "wellness":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Interlocking Health & Intimacy Symbols */}
          <circle cx="36" cy="44" r="14" className="fill-purple-200/50 stroke-purple-600" />
          <circle cx="46" cy="34" r="14" className="fill-indigo-200/50 stroke-indigo-600" />
          <line x1="36" y1="58" x2="36" y2="70" className="stroke-purple-600" />
          <line x1="30" y1="64" x2="42" y2="64" className="stroke-purple-600" />
          <line x1="56" y1="24" x2="66" y2="14" className="stroke-indigo-600" />
          <polyline points="56,14 66,14 66,24" className="stroke-indigo-600" />
        </svg>
      );
    case "cold":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Profile Coughing / Cold Relief */}
          <path d="M46 16 C36 16 32 24 32 32 C32 38 34 40 32 44 C30 48 24 50 24 54 C24 60 30 64 38 64 C48 64 54 58 54 44 C54 30 54 16 46 16 Z" className="fill-cyan-100 stroke-cyan-600" />
          <path d="M22 42 C16 40 14 36 12 36" className="stroke-cyan-500 stroke-dasharray-[3,3]" />
          <path d="M20 48 C14 48 10 46 8 46" className="stroke-cyan-500 stroke-dasharray-[3,3]" />
          <path d="M22 54 C16 56 12 58 10 60" className="stroke-cyan-500 stroke-dasharray-[3,3]" />
          <path d="M28 62 C32 68 40 70 48 70" className="stroke-teal-600 fill-teal-100" />
        </svg>
      );
    case "pediatrics":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Baby / Infant Wellness */}
          <circle cx="40" cy="30" r="16" className="fill-amber-100 stroke-amber-500" />
          <circle cx="34" cy="28" r="2.5" className="fill-amber-800 stroke-none" />
          <circle cx="46" cy="28" r="2.5" className="fill-amber-800 stroke-none" />
          <path d="M37 36 C39 38 41 38 43 36" className="stroke-amber-700" />
          {/* Baby Romper / Clothes */}
          <path d="M26 48 C26 44 32 42 40 42 C48 42 54 44 54 48 L56 64 C56 68 50 70 40 70 C30 70 24 68 24 64 Z" className="fill-indigo-200 stroke-indigo-600" />
          <circle cx="40" cy="20" r="3" className="fill-amber-300 stroke-amber-600" />
        </svg>
      );
    case "mental-health":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Mind & Mental Wellness Cross */}
          <circle cx="40" cy="40" r="24" className="fill-rose-100 stroke-rose-400" />
          <path d="M34 26 C34 22 46 22 46 26 C46 32 34 32 34 40 C34 44 46 44 46 48 C46 54 34 54 34 50" className="stroke-rose-600" />
          <rect x="37" y="32" width="6" height="16" rx="2" className="fill-rose-600 stroke-none" />
          <rect x="32" y="37" width="16" height="6" rx="2" className="fill-rose-600 stroke-none" />
        </svg>
      );
    case "orthopedics":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Joint & Bone Mobility */}
          <path d="M32 20 C32 16 48 16 48 20 C48 28 44 32 44 40 C44 48 48 52 48 60 C48 64 32 64 32 60 C32 52 36 48 36 40 C36 32 32 28 32 20 Z" className="fill-amber-100 stroke-amber-600" />
          <circle cx="40" cy="40" r="6" className="fill-amber-400 stroke-amber-700" />
          <path d="M26 38 L34 40 L26 42" className="stroke-amber-600" />
          <path d="M54 38 L46 40 L54 42" className="stroke-amber-600" />
        </svg>
      );
    case "dentistry":
      return (
        <svg
          viewBox="0 0 80 80"
          className="size-16 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Tooth with Shine */}
          <path d="M26 24 C30 18 36 20 40 24 C44 20 50 18 54 24 C58 30 58 42 54 54 C52 60 48 68 44 68 C42 68 42 56 40 56 C38 56 38 68 36 68 C32 68 28 60 26 54 C22 42 22 30 26 24 Z" className="fill-emerald-100 stroke-emerald-600" />
          <circle cx="48" cy="28" r="2" className="fill-amber-400 stroke-none" />
          <path d="M48 22 L48 24 M54 28 L52 28" className="stroke-amber-400" />
        </svg>
      );
    default:
      return null;
  }
}

export function HealthConcernTiles() {
  return (
    <section className="py-12 sm:py-16 bg-white border-b border-border/60">
      <div className="w-full">
        {/* Schedula health-concern header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
              Consult top doctors for any health concern
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Book in-clinic appointments with verified specialists across all medical fields
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="self-start md:self-auto border-primary/60 text-primary hover:bg-primary/5 hover:text-primary font-semibold"
          >
            <Link href="/doctors">
              View All Specialities
            </Link>
          </Button>
        </div>

        {/* Health-concern tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-6 sm:gap-4">
          {SCHEDULA_HEALTH_CONCERNS.map((concern) => (
            <Link
              key={concern.id}
              href={concern.href}
              className="group flex flex-col items-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl p-2 transition-transform duration-200 hover:-translate-y-1"
            >
              {/* Circular Avatar Container */}
              <div
                className={`relative flex size-28 sm:size-32 items-center justify-center rounded-full border shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-md ${concern.bgClass} ${concern.avatarBorder}`}
              >
                <HealthConcernIllustration type={concern.illustrationType} />
              </div>

              {/* Concern Title (Two lines max) */}
              <h3 className="mt-3.5 text-xs sm:text-sm font-semibold text-slate-800 line-clamp-2 max-w-[130px] leading-snug">
                {concern.title}
              </h3>

              {/* Action Link: "CONSULT NOW" in Teal uppercase */}
              <span className="mt-2 text-[11px] font-bold tracking-wider text-primary uppercase group-hover:underline flex items-center gap-0.5">
                {concern.actionText}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
