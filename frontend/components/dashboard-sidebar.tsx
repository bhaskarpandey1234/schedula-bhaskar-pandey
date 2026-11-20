"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  HeartPulse,
  Home,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

const itemsByRole = {
  patient: [
    { href: "/patient", label: "Overview", icon: Home },
    { href: "/doctors", label: "Find Doctors", icon: Search },
    { href: "/patient/appointments", label: "Appointments", icon: CalendarDays },
    { href: "/patient/history", label: "Medical records", icon: ClipboardList },
    { href: "/patient/assistant", label: "AI Assistant", icon: HeartPulse },
    { href: "/patient/profile", label: "My Profile", icon: UserRound },
  ],
  doctor: [
    { href: "/doctor", label: "Overview", icon: Home },
    { href: "/doctor/schedule", label: "Availability", icon: CalendarDays },
    { href: "/doctor/appointments", label: "Appointments", icon: ClipboardList },
    { href: "/doctor/queue", label: "Queue overview", icon: ClipboardList },
    { href: "/doctor/assistant", label: "AI Assistant", icon: HeartPulse },
    { href: "/doctor/profile", label: "Doctor profile", icon: UserRound },
  ],
  staff: [
    { href: "/staff", label: "Queue dashboard", icon: ClipboardList },
  ],
  admin: [
    { href: "/admin", label: "Clinic management", icon: Building2 },
    { href: "/admin/queue", label: "Queue dashboard", icon: ClipboardList },
  ],
} satisfies Record<Role, Array<{ href: string; label: string; icon: LucideIcon }>>;

const rolePresentation: Record<Role, { title: string; section: string }> = {
  patient: { title: "Patient Portal", section: "Patient care" },
  doctor: { title: "Doctor Portal", section: "Clinical workspace" },
  staff: { title: "Receptionist Portal", section: "Clinic operations" },
  admin: { title: "Clinic Admin Portal", section: "Administration" },
};

export function DashboardSidebar({
  role,
  name,
  assistantEnabled = false,
}: {
  role: Role;
  name?: string;
  assistantEnabled?: boolean;
}) {
  const pathname = usePathname();
  const presentation = rolePresentation[role];
  const items = itemsByRole[role].filter((item) =>
    assistantEnabled || !item.href.endsWith("/assistant"),
  );
  const displayName = name || "Signed-in account";
  const initials = displayName
    .replace(/^(Dr\.?)\s+/i, "")
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SC";

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-surface-muted/30 lg:block">
      <div className="sticky top-16 flex h-[calc(100svh-4rem)] flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
              </div>
            </div>
          </div>

          <nav aria-label={`${presentation.title} navigation`} className="grid gap-1.5">
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              {presentation.section}
            </p>
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/patient" && href !== "/doctor" && href !== "/staff" && href !== "/admin" && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-card hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-primary-foreground" : "text-primary")} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-primary">
            {role === "doctor" ? <Stethoscope className="size-4" /> : <ShieldCheck className="size-4" />}
            <span>{role === "staff" ? "Reception operations" : role === "admin" ? "Clinic access" : "Need assistance?"}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {role === "doctor"
              ? "Focus on consultations. Reception staff manage check-in and queue status."
              : role === "staff"
                ? "Review the selected clinic date and doctor before changing a queue status."
                : role === "admin"
                  ? "Manage clinic assignments and review the shared queue dashboard."
                  : "View appointments, booking details, and care options in your portal."}
          </p>
        </div>
      </div>
    </aside>
  );
}
