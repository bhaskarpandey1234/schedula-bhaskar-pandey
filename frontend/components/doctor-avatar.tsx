"use client";

import Image from "next/image";
import { useState } from "react";
import { UserRound } from "lucide-react";

export function doctorInitials(name?: string | null) {
  const words = (name ?? "").trim().replace(/^(dr\.?|doctor)\s+/i, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function DoctorAvatar({ name, src, className = "size-14", imageClassName = "object-cover" }: { name?: string | null; src?: string | null; className?: string; imageClassName?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = doctorInitials(name);
  if (!src?.trim() || failed) return <div role="img" aria-label={`${name || "Doctor"} profile`} className={`flex items-center justify-center rounded-full bg-primary/15 text-primary ${className}`}>{initials ? <span className="font-semibold" aria-hidden="true">{initials}</span> : <UserRound className="size-1/2" aria-hidden="true" />}</div>;
  return <div className={`relative overflow-hidden rounded-full ${className}`}><Image src={src.trim()} alt={`${name || "Doctor"} profile`} fill unoptimized sizes="160px" className={imageClassName} onError={() => setFailed(true)} /></div>;
}
