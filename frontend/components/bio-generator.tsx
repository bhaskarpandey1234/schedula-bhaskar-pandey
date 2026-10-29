"use client";

import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateDoctorBio } from "@/lib/profile-options";

export function BioGenerator({ specialty, clinicName, experienceYears, onGenerate }: { specialty: string; clinicName: string; experienceYears: string | number; onGenerate: (bio: string) => void }) {
  return <Button type="button" variant="outline" size="sm" onClick={() => onGenerate(generateDoctorBio({ specialty, clinicName, experienceYears }))}><WandSparkles aria-hidden="true" />Generate bio from profile details</Button>;
}
