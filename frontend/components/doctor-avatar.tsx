"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const DEFAULT_DOCTOR_PROFILE_IMAGE = "/images/default-doctor-avatar.png";

export function DoctorAvatar({
  name,
  src,
  className = "size-14 rounded-full",
  imageClassName = "object-cover",
  fallbackImageClassName = "object-contain p-1",
  sizes = "160px",
}: {
  name?: string | null;
  src?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackImageClassName?: string;
  sizes?: string;
}) {
  const normalizedSource = src?.trim() || "";
  const [failedSource, setFailedSource] = useState("");
  const usesFallback = !normalizedSource || failedSource === normalizedSource;
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image
        src={usesFallback ? DEFAULT_DOCTOR_PROFILE_IMAGE : normalizedSource}
        alt={`${name?.trim() || "Doctor"} profile`}
        fill
        unoptimized={!usesFallback}
        sizes={sizes}
        className={usesFallback ? fallbackImageClassName : imageClassName}
        onError={usesFallback ? undefined : () => setFailedSource(normalizedSource)}
      />
    </div>
  );
}
