"use client";

import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  HeartPulse,
  Home,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

const patientItems = [
  { href: "/patient", label: "Overview", icon: Home },
  { href: "/doctors", label: "Find Doctors", icon: Search },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/patient/profile", label: "My Profile", icon: UserRound },
];

const doctorItems = [
  { href: "/doctor", label: "Overview", icon: Home },
  { href: "/doctor/schedule", label: "Availability", icon: CalendarDays },
  { href: "/doctor/appointments", label: "Appointments", icon: ClipboardList },
  { href: "/doctor/profile", label: "Doctor Profile", icon: UserRound },
];

export function DashboardSidebar({
  role,
  name,
}: {
  role: Role;
  name?: string;
}) {
  const pathname = usePathname();
  const items = role === "patient" ? patientItems : doctorItems;

  const displayName = name || (role === "doctor" ? "Doctor" : "Patient");
  const initials = displayName
    .replace(/^(Dr\.?)\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || (role === "doctor" ? "DR" : "PT");

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-surface-muted/30 lg:block">
      <div className="sticky top-16 flex h-[calc(100svh-4rem)] flex-col justify-between p-4">
        <div className="space-y-6">
          {/* User Profile Summary Card in Sidebar */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm shadow-inner">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                {displayName}
              </p>
              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                {role === "doctor" ? (
                  <>
                    <Stethoscope className="size-3 text-primary shrink-0" />
                    <span className="truncate">Practicing MD</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3 text-emerald-600 shrink-0" />
                    <span className="truncate">Verified Patient</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav aria-label="Dashboard navigation" className="grid gap-1.5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">
              {role === "doctor" ? "Doctor Workspace" : "Patient Hub"}
            </p>
            {items.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== "/patient" &&
                  href !== "/doctor" &&
                  pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-xs"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-primary-foreground" : "text-primary"
                    )}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Helpful Callout */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-primary mb-1">
            <HeartPulse className="size-4" />
            <span>Need Assistance?</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {role === "doctor"
              ? "Keep your slots updated to allow patients to book upcoming appointments."
              : "Need help with a visit? View booking details in Appointments."}
          </p>
        </div>
      </div>
    </aside>
  );
}
