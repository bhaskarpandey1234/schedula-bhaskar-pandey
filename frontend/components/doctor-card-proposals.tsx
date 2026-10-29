import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateLabel } from "@/lib/discovery/format";
import type { DoctorDirectoryRecord } from "@/lib/discovery/types";

export type ExtendedDoctorProposalProps = {
  doctor: DoctorDirectoryRecord;
  photoUrl?: string;
  biography?: string;
  consultationHours?: string;
  verified?: boolean;
  slots?: Array<{ time: string; capacity: string; slotId?: string }>;
  onBookClick?: () => void;
  referenceDate?: string;
  compact?: boolean;
};

export type AvailabilityStatus = {
  label: string;
  isToday: boolean;
  variant: "emerald" | "sky" | "neutral";
};

export type DirectorySearchHeaderProposalProps = {
  totalDoctors?: number;
  searchValue?: string;
  selectedSpecialty?: string;
  specialties?: string[];
  isAvailableTodayOnly?: boolean;
  onSearchChange?: (val: string) => void;
  onSpecialtyChange?: (val: string) => void;
  onToggleAvailableToday?: () => void;
  onClearFilters?: () => void;
};

/**
 * Extracts clean physician initials, stripping titles (Dr., Prof., Mr., Ms., etc.)
 * with or without periods, and medical/academic credentials (MD, DO, PhD, MBBS, FACS, etc.).
 * Fully resilient against international characters, parentheses-enclosed credentials, and punctuation.
 */
export function getDoctorInitials(name: string): string {
  if (!name || typeof name !== "string") return "DR";

  // Strip leading honorific titles (supporting both British style without dot and US style with dot)
  const cleanTitle = name
    .trim()
    .replace(/^(Dr\.?|Doctor|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?)\s+/i, "")
    .replace(/\([^)]*\)/g, "") // strip parenthetical tags like (Cardiology), (MD), etc.
    .replace(/\[[^\]]*\]/g, "") // strip bracketed tags like [Surgeon], etc.
    .replace(/\s+[-–—]\s+.*$/, "") // strip trailing department/role suffixes like " - Surgery"
    .trim();

  const tokens = cleanTitle
    .split(/[\s,]+/)
    .map((t) =>
      t
        // Strip enclosing parentheses, brackets, quotes, dashes, and punctuation
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
        .replace(/[.,()\[\]{}"']/g, "")
        .trim()
    )
    .filter(Boolean);

  const ignoredTokens = new Set([
    "DR",
    "DOCTOR",
    "PROF",
    "PROFESSOR",
    "MR",
    "MRS",
    "MS",
    "MD",
    "DO",
    "MBBS",
    "PHD",
    "MS",
    "DM",
    "MCH",
    "MPH",
    "DCH",
    "FCPS",
    "RN",
    "NP",
    "PA",
    "CNM",
    "CRNA",
    "DC",
    "DDS",
    "DMD",
    "FACS",
    "FACC",
    "FAAP",
    "FACP",
    "FRCS",
    "MRCP",
    "DNB",
    "BDS",
    "MDS",
    "JR",
    "SR",
    "II",
    "III",
    "IV",
  ]);

  const nameWords = tokens.filter((tok) => !ignoredTokens.has(tok.toUpperCase()));

  if (nameWords.length === 0) return "DR";
  if (nameWords.length === 1) {
    const chars = Array.from(nameWords[0]);
    return chars.slice(0, 2).join("").toUpperCase();
  }
  const firstChar = Array.from(nameWords[0])[0] || "";
  const lastChar = Array.from(nameWords[nameWords.length - 1])[0] || "";
  return (firstChar + lastChar).toUpperCase();
}

/**
 * Resolves a clinical portrait photo for a physician.
 * If an explicit customUrl is provided, it is returned directly.
 * Otherwise, assigns a realistic, high-resolution physician portrait in a white coat
 * deterministically based on specialty and doctor identity so cards never look like blank wireframes.
 */
export function getDoctorPortrait(
  doctor?: Partial<DoctorDirectoryRecord> | null,
  customUrl?: string
): string {
  if (customUrl && typeof customUrl === "string" && customUrl.trim().length > 0) {
    return customUrl.trim();
  }

  const portraitsBySpecialty: Record<string, string[]> = {
    cardiology: [
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600",
    ],
    dermatology: [
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=600",
    ],
    neurology: [
      "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
    ],
    pediatrics: [
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=600",
    ],
    "general medicine": [
      "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
    ],
    "orthopedic surgery": [
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=600",
    ],
    dentist: [
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=600",
    ],
    gynecology: [
      "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
    ],
    dietitian: [
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=600",
    ],
    physiotherapy: [
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=600",
    ],
    psychiatry: [
      "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
    ],
    ophthalmology: [
      "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=600",
    ],
  };

  const pool =
    portraitsBySpecialty[doctor?.specialty?.toLowerCase()?.trim() || ""] || [
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1594824813572-8f240f92b77a?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=600",
    ];

  const seedStr = doctor?.doctor_id || doctor?.full_name || "default-physician";
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % pool.length;
  return pool[index];
}

/**
 * Evaluates available dates against a reference date (defaults to today UTC)
 * to return an accurate clinical status indicator (today vs tomorrow vs date vs empty).
 * Filters out stale past dates, normalizes ISO timestamp strings, and validates dates so
 * old appointments or malformed inputs never masquerade as upcoming.
 */
export function getAvailabilityStatus(
  availableDates: string[] = [],
  referenceDate?: string
): AvailabilityStatus {
  if (!availableDates || availableDates.length === 0) {
    return {
      label: "Check schedule",
      isToday: false,
      variant: "neutral",
    };
  }

  let now: Date;
  if (referenceDate && typeof referenceDate === "string") {
    const cleanRef = referenceDate.trim().slice(0, 10);
    now = new Date(`${cleanRef}T00:00:00Z`);
    if (isNaN(now.getTime())) {
      now = new Date();
    }
  } else {
    now = new Date();
  }

  const todayKey = now.toISOString().slice(0, 10);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  // Normalize, filter out any stale past dates, and validate ISO calendar dates
  const upcomingDates = (Array.isArray(availableDates) ? availableDates : [])
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().slice(0, 10))
    .filter(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        !isNaN(new Date(`${d}T12:00:00Z`).getTime()) &&
        d >= todayKey
    )
    .sort();

  if (upcomingDates.length === 0) {
    return {
      label: "Check schedule",
      isToday: false,
      variant: "neutral",
    };
  }

  const firstDate = upcomingDates[0];

  if (firstDate === todayKey) {
    return {
      label: "Available today",
      isToday: true,
      variant: "emerald",
    };
  }

  if (firstDate === tomorrowKey) {
    return {
      label: "Next: Tomorrow",
      isToday: false,
      variant: "sky",
    };
  }

  const dateObj = new Date(`${firstDate}T12:00:00Z`);
  const formatted = isNaN(dateObj.getTime())
    ? firstDate
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        dateObj
      );

  return {
    label: `Next: ${formatted}`,
    isToday: false,
    variant: "neutral",
  };
}

/**
 * Proposal 1: Clinical Trust & Split-Card Direct Booking (Evolutionary Reference Modernization)
 * Directly inspired by the reference image's horizontal split card (photo left, details right),
 * but elevated with WCAG AAA accessible contrast, responsive flex wrapping, verified provider badges,
 * accurate real-time availability states, 320px mobile viewport resiliency, and clear action hierarchy.
 */
export function SplitCardDoctorProposal({
  doctor,
  photoUrl,
  biography,
  consultationHours = "09:30 AM – 05:00 PM",
  verified = true,
  onBookClick,
  referenceDate,
  compact = false,
}: ExtendedDoctorProposalProps) {
  const doctorName = doctor?.full_name?.trim() || "Physician";
  const specialty = doctor?.specialty?.trim() || "General Practice";
  const clinicName = doctor?.clinic_name?.trim() || "Schedula Medical Center";
  const experienceYears = typeof doctor?.experience_years === "number" ? doctor.experience_years : 0;
  const rawDates = Array.isArray(doctor?.available_dates) ? doctor.available_dates : [];

  const status = getAvailabilityStatus(rawDates, referenceDate);
  const initials = getDoctorInitials(doctorName);
  const sampleBio =
    biography ||
    `Specializing in ${specialty.toLowerCase()} with ${experienceYears} ${experienceYears === 1 ? "year" : "years"} of dedicated clinical practice and compassionate, evidence-based patient care.`;

  const refDateStr =
    referenceDate && typeof referenceDate === "string" ? referenceDate.trim().slice(0, 10) : "";
  const todayKey =
    refDateStr && /^\d{4}-\d{2}-\d{2}$/.test(refDateStr)
      ? refDateStr
      : new Date().toISOString().slice(0, 10);

  const upcomingDates = rawDates
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().slice(0, 10))
    .filter(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        !isNaN(new Date(`${d}T12:00:00Z`).getTime()) &&
        d >= todayKey
    )
    .sort();

  return (
    <Card
      className={`group flex h-full flex-col overflow-hidden border-border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-md ${
        compact ? "" : "sm:flex-row"
      }`}
    >
      {/* Left Column: Physician Portrait & Presence Indicator */}
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-surface-muted to-primary/5 ${
          compact
            ? "h-56 min-h-[14rem] w-full"
            : "min-h-[220px] w-full sm:w-5/12 sm:min-w-[13rem] sm:self-stretch"
        }`}
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={`Portrait of ${doctorName}`}
            fill
            unoptimized
            className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 320px"
          />
        ) : (
          <div className="flex h-full w-full min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-inner sm:size-24">
              <span className="font-mono text-2xl font-bold tracking-wider">{initials}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Stethoscope className="size-3.5 text-primary" aria-hidden="true" />
              <span>Verified Clinical Profile</span>
            </div>
          </div>
        )}

        {/* Availability Status Badge: Floating at the bottom-left of the portrait */}
        <div className="absolute bottom-3 left-3 z-10">
          {status.variant === "emerald" && (
            <div
              role="status"
              aria-label={`Availability: ${status.label}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-card/95 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur dark:border-emerald-800 dark:bg-card/90 dark:text-emerald-300"
            >
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
              </span>
              <span>{status.label}</span>
            </div>
          )}

          {status.variant === "sky" && (
            <div
              role="status"
              aria-label={`Availability: ${status.label}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/90 bg-card/95 px-2.5 py-1 text-xs font-semibold text-sky-800 shadow-sm backdrop-blur dark:border-sky-800 dark:bg-card/90 dark:text-sky-300"
            >
              <span className="size-2 rounded-full bg-sky-500" aria-hidden="true" />
              <span>{status.label}</span>
            </div>
          )}

          {status.variant === "neutral" && (
            <div
              role="status"
              aria-label={`Availability: ${status.label}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur"
            >
              <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
              <span>{status.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Clinical Details & Dual Action Hierarchy */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-6">
        <div>
          {/* Header Row: Specialty Badge + Verification + Experience */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary break-words">
              {specialty}
            </span>
            <div className="flex items-center gap-2">
              {verified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                  Verified MD
                </span>
              )}
              <Badge variant="secondary" className="text-xs">
                {experienceYears} {experienceYears === 1 ? "yr" : "yrs"} exp
              </Badge>
            </div>
          </div>

          {/* Physician Name & Clinic Location */}
          <h3 className="mt-2 text-xl font-bold tracking-tight text-foreground break-words sm:text-2xl">
            {doctorName}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
            <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="break-words">{clinicName}</span>
          </p>

          {/* Bio Excerpt */}
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90 sm:text-sm">
            {sampleBio}
          </p>

          {/* Consultation Envelope & Upcoming Dates (Safely wrapping for 320px mobile viewports) */}
          <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
              <Clock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>Consultation Hours:</span>
              <span className="font-mono text-muted-foreground">{consultationHours}</span>
            </p>

            <div className="flex items-start gap-2">
              <CalendarDays className="size-3.5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Upcoming:</span>
                {upcomingDates.length ? (
                  upcomingDates.slice(0, 3).map((date) => (
                    <Badge key={date} variant="outline" className="text-[11px] font-normal">
                      {formatDateLabel(date)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">Schedule on request</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dual Action Buttons: High-Contrast Primary + Accessible Secondary Outline */}
        <div
          className={`mt-5 flex flex-col gap-2 pt-2 ${
            compact ? "" : "sm:flex-row sm:items-center"
          }`}
        >
          {/* Primary CTA: Book Appointment (Direct Slot Selection) */}
          {onBookClick ? (
            <Button
              onClick={onBookClick}
              aria-label={`Book appointment with ${doctorName}`}
              className="flex-1 min-h-[2.5rem] gap-2 font-medium shadow-sm"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              Book Appointment
            </Button>
          ) : (
            <Button asChild className="flex-1 min-h-[2.5rem] gap-2 font-medium shadow-sm">
              <Link
                href={`/doctors/${doctor?.doctor_id || ""}#availability`}
                aria-label={`Book appointment with ${doctorName}`}
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                Book Appointment
              </Link>
            </Button>
          )}

          {/* Secondary CTA: More Info / View Profile (Replaces unreadable yellow button with AAA outline) */}
          <Button
            asChild
            variant="outline"
            className="flex-1 min-h-[2.5rem] gap-1.5 font-medium sm:flex-initial"
          >
            <Link
              href={`/doctors/${doctor?.doctor_id || ""}`}
              aria-label={`View more information about ${doctorName}`}
            >
              More Info
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Proposal 2: Modern High-Efficiency Telehealth & Quick-Slot Discovery (Slot-Forward Standard)
 * Designed for immediate time-to-booking. Exposes the next bookable time slots directly as interactive
 * chips on the card, enabling patients to confirm care without unnecessary intermediate page hops.
 * Features truthful handling when a doctor has no remaining slots today.
 */
export function SlotForwardDoctorProposal({
  doctor,
  photoUrl,
  biography,
  slots,
  onBookClick,
}: ExtendedDoctorProposalProps) {
  const doctorName = doctor?.full_name?.trim() || "Physician";
  const specialty = doctor?.specialty?.trim() || "General Practice";
  const clinicName = doctor?.clinic_name?.trim() || "Schedula Medical Center";
  const experienceYears = typeof doctor?.experience_years === "number" ? doctor.experience_years : 0;
  const doctorId = doctor?.doctor_id || "";

  const initials = getDoctorInitials(doctorName);
  const isCustomProvided = slots !== undefined;
  const activeSlots = isCustomProvided
    ? slots
    : [
        { time: "09:30 AM", capacity: "2 left", slotId: "slot-1" },
        { time: "11:15 AM", capacity: "1 left", slotId: "slot-2" },
        { time: "02:45 PM", capacity: "3 left", slotId: "slot-3" },
      ];
  const hasSlots = activeSlots.length > 0;

  return (
    <Card className="flex h-full flex-col justify-between border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md sm:p-5">
      <div>
        {/* Top Identity Header */}
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="relative shrink-0">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={`Portrait of ${doctorName}`}
                width={56}
                height={56}
                unoptimized
                className="size-14 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 font-bold text-primary">
                {initials}
              </div>
            )}
            <span
              className="absolute -bottom-1 -right-1 rounded-full bg-emerald-600 p-0.5 text-white ring-2 ring-white dark:ring-card"
              title="Verified Physician"
            >
              <CheckCircle2 className="size-3" aria-hidden="true" />
              <span className="sr-only">Verified Physician</span>
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                {specialty}
              </span>
              <Badge variant="secondary" className="text-[11px]">
                {experienceYears} {experienceYears === 1 ? "yr" : "yrs"} exp
              </Badge>
            </div>
            <h3 className="text-base font-bold text-foreground break-words sm:text-lg">
              {doctorName}
            </h3>
            <p className="text-xs text-muted-foreground break-words">{clinicName}</p>
          </div>
        </div>

        {/* Clinical Focus Excerpt */}
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground leading-relaxed sm:line-clamp-1">
          {biography || `Preventive ${specialty.toLowerCase()} and comprehensive patient-focused care.`}
        </p>

        {/* Immediate Next Available Slots Tray or Truthful Empty State */}
        {hasSlots ? (
          <div className="mt-4 rounded-lg bg-surface-muted p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Next Available Today:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {activeSlots.map((slot) => {
                const targetHref = slot.slotId
                  ? `/patient/doctors/${doctorId}/book/${slot.slotId}`
                  : `/doctors/${doctorId}#availability`;

                return (
                  <Link
                    key={slot.time}
                    href={targetHref}
                    aria-label={`Book appointment at ${slot.time} with ${doctorName} (${slot.capacity})`}
                    className="group flex flex-col items-center justify-center rounded-md border border-border bg-card px-1.5 py-1.5 text-center transition-all hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground group-hover:text-primary">
                      {slot.time}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{slot.capacity}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-surface-muted/50 p-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              No remaining slots today
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">
              Check upcoming schedule for future dates
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-4 flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        {hasSlots ? (
          onBookClick ? (
            <Button
              onClick={onBookClick}
              size="sm"
              className="flex-1 font-medium min-h-[2.25rem]"
              aria-label={`Book next appointment with ${doctorName} at ${activeSlots[0].time}`}
            >
              Book Next ({activeSlots[0].time})
            </Button>
          ) : (
            <Button asChild size="sm" className="flex-1 font-medium min-h-[2.25rem]">
              <Link
                href={
                  activeSlots[0].slotId
                    ? `/patient/doctors/${doctorId}/book/${activeSlots[0].slotId}`
                    : `/doctors/${doctorId}#availability`
                }
                aria-label={`Book next appointment with ${doctorName} at ${activeSlots[0].time}`}
              >
                Book Next ({activeSlots[0].time})
              </Link>
            </Button>
          )
        ) : (
          <Button asChild size="sm" className="flex-1 font-medium min-h-[2.25rem]">
            <Link
              href={`/doctors/${doctorId}#availability`}
              aria-label={`View upcoming schedule for ${doctorName}`}
            >
              View Schedule
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="flex-1 min-h-[2.25rem]">
          <Link
            href={`/doctors/${doctorId}`}
            aria-label={`View full profile for ${doctorName}`}
          >
            Full Profile
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/**
 * Proposal 3: Editorial Hospital System & Holistic Care Hub (Institutional Standard)
 * Designed for hospital systems, tertiary care centers, and academic medical institutions (Mayo / Cleveland Clinic style).
 * Emphasizes clinical authority, board certifications, and comprehensive patient care options.
 */
export function InstitutionalDoctorProposal({
  doctor,
  photoUrl,
  biography,
  consultationHours = "Mon – Fri, 08:30 AM – 04:30 PM",
  onBookClick,
}: ExtendedDoctorProposalProps) {
  const doctorName = doctor?.full_name?.trim() || "Physician";
  const specialty = doctor?.specialty?.trim() || "General Practice";
  const clinicName = doctor?.clinic_name?.trim() || "Schedula Medical Center";
  const doctorId = doctor?.doctor_id || "";

  const initials = getDoctorInitials(doctorName);

  return (
    <Card className="flex h-full flex-col justify-between border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg sm:p-6 lg:p-8">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Stethoscope className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">Department of {specialty}</span>
        </div>

        <div className="mt-3 flex items-start gap-3 sm:gap-4">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={`Clinical portrait of ${doctorName}`}
              width={80}
              height={100}
              unoptimized
              className="size-16 shrink-0 rounded-xl border border-border object-cover shadow-sm sm:size-24"
            />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-serif text-lg font-bold text-slate-800 shadow-inner dark:bg-slate-800 dark:text-slate-100 sm:size-20 sm:text-xl">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-xl font-bold tracking-tight text-foreground break-words sm:text-2xl">
              {doctorName}
            </h3>
            <p className="text-xs text-muted-foreground break-words">
              {clinicName} • Attending Physician
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[10px]">
                Board Certified
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                In-Person & Telehealth
              </Badge>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {biography ||
            `Dedicated to clinical excellence in ${specialty.toLowerCase()}, specialized diagnosis, and individualized patient management.`}
        </p>

        <div className="mt-4 rounded-md border border-border/60 bg-surface-muted/60 p-2.5 text-xs text-muted-foreground break-words">
          <span className="font-medium text-foreground">Clinic Hours:</span> {consultationHours}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {onBookClick ? (
          <Button
            onClick={onBookClick}
            className="flex-1 font-medium min-h-[2.5rem]"
            aria-label={`Request appointment with ${doctorName}`}
          >
            Request Appointment
          </Button>
        ) : (
          <Button asChild className="flex-1 font-medium min-h-[2.5rem]">
            <Link
              href={`/doctors/${doctorId}#availability`}
              aria-label={`Request appointment with ${doctorName}`}
            >
              Request Appointment
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" className="flex-1 min-h-[2.5rem]">
          <Link
            href={`/doctors/${doctorId}`}
            aria-label={`View physician dossier for ${doctorName}`}
          >
            Physician Dossier
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/**
 * Modern Clinical Directory Header & Search Bar Proposal
 * Replaces the reference image's flat sky-blue banner and low-contrast input with
 * an elevated healthcare search console featuring WCAG AAA contrast, semantic navigation,
 * multi-dimensional filtering (specialty & same-day availability), and active filter chips.
 */
export function DirectorySearchHeaderProposal({
  totalDoctors = 24,
  searchValue = "",
  selectedSpecialty = "",
  specialties = [
    "Cardiology",
    "Dermatology",
    "Neurology",
    "Orthopedic Surgery",
    "Pediatrics",
    "Internal Medicine",
  ],
  isAvailableTodayOnly = false,
  onSearchChange,
  onSpecialtyChange,
  onToggleAvailableToday,
  onClearFilters,
}: DirectorySearchHeaderProposalProps) {
  const hasActiveFilters = Boolean(searchValue || selectedSpecialty || isAvailableTodayOnly);

  return (
    <div className="grid gap-6">
      {/* Semantic Healthcare Header (Modernizing the Reference Blue Banner) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary/90 p-6 text-primary-foreground shadow-sm sm:p-8">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
              Appointments / Find a Doctor
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Find a Healthcare Specialist
            </h1>
            <p className="text-xs text-primary-foreground/90 sm:text-sm">
              Schedule in-person or telehealth consultations with credentialed, board-certified physicians.
            </p>
          </div>

          <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm sm:self-auto">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{totalDoctors} Verified Physicians</span>
          </div>
        </div>
      </div>

      {/* Multi-Faceted Healthcare Search Bar Form */}
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] md:items-center"
      >
        {/* Doctor Name / Condition Search */}
        <div className="relative">
          <label htmlFor="search-doctor-input" className="sr-only">
            Search doctor by name or medical condition
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="search-doctor-input"
            name="q"
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search by physician name or symptom..."
            className="pl-9 text-sm focus-visible:ring-primary"
          />
        </div>

        {/* Specialty Select Filter */}
        <div className="relative">
          <label htmlFor="search-specialty-select" className="sr-only">
            Filter by medical specialty
          </label>
          <select
            id="search-specialty-select"
            name="specialty"
            value={selectedSpecialty}
            onChange={(e) => onSpecialtyChange?.(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="">All Specialties</option>
            {specialties.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>
        </div>

        {/* Available Today Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={isAvailableTodayOnly}
          onClick={onToggleAvailableToday}
          className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isAvailableTodayOnly
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "border-input bg-card text-foreground hover:bg-surface-muted"
          }`}
        >
          <span
            className={`size-2 rounded-full ${
              isAvailableTodayOnly ? "bg-emerald-600 animate-pulse" : "bg-muted-foreground"
            }`}
            aria-hidden="true"
          />
          Available Today
        </button>

        {/* Search Submit CTA */}
        <Button type="submit" className="gap-2 font-medium shadow-sm">
          <Search className="size-4" aria-hidden="true" />
          <span>Find Care</span>
        </Button>
      </form>

      {/* Active Filter Chips Row */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">Active filters:</span>

          {searchValue && (
            <Badge variant="secondary" className="gap-1 font-normal">
              Query: &quot;{searchValue}&quot;
              <button
                type="button"
                onClick={() => onSearchChange?.("")}
                aria-label="Remove search query filter"
                className="ml-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          )}

          {selectedSpecialty && (
            <Badge variant="secondary" className="gap-1 font-normal">
              Specialty: {selectedSpecialty}
              <button
                type="button"
                onClick={() => onSpecialtyChange?.("")}
                aria-label={`Remove ${selectedSpecialty} filter`}
                className="ml-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          )}

          {isAvailableTodayOnly && (
            <Badge
              variant="secondary"
              className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-normal"
            >
              Available Today
              <button
                type="button"
                onClick={onToggleAvailableToday}
                aria-label="Remove available today filter"
                className="ml-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          )}

          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              aria-label="Clear all directory search filters"
              className="text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Reset all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
