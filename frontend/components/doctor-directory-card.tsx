import { SplitCardDoctorProposal, getDoctorPortrait } from "@/components/doctor-card-proposals";
import type { DoctorDirectoryRecord } from "@/lib/discovery/types";

export type DoctorDirectoryCardProps = {
  doctor: DoctorDirectoryRecord;
  photoUrl?: string;
  biography?: string;
  consultationHours?: string;
  verified?: boolean;
  compact?: boolean;
};

/**
 * Production DoctorDirectoryCard implementing Proposal 1: Clinical Trust & Split-Card Direct Booking.
 * Modernizes the reference appointment directory layout with authentic physician portraits/initials,
 * WCAG AAA contrast compliance, animated availability pulse, and primary/secondary button hierarchy.
 */
export function DoctorDirectoryCard({
  doctor,
  photoUrl,
  biography,
  consultationHours,
  verified = true,
  compact = false,
}: DoctorDirectoryCardProps) {
  const effectivePhoto = getDoctorPortrait(doctor, photoUrl);

  return (
    <SplitCardDoctorProposal
      doctor={doctor}
      photoUrl={effectivePhoto}
      biography={biography}
      consultationHours={consultationHours}
      verified={verified}
      compact={compact}
    />
  );
}
