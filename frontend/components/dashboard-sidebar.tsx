"use client";

import Link from "next/link";
import { CalendarDays, ClipboardList, Home, Search, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

const patientItems = [
  { href: "/patient", label: "Overview", icon: Home },
  { href: "/doctors", label: "Find doctors", icon: Search },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/patient/profile", label: "Profile", icon: UserRound },
];

const doctorItems = [
  { href: "/doctor", label: "Overview", icon: Home },
  { href: "/doctor/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/doctor/appointments", label: "Appointments", icon: ClipboardList },
  { href: "/doctor/profile", label: "Profile", icon: UserRound },
];

export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = role === "patient" ? patientItems : doctorItems;
  return <aside className="hidden w-60 shrink-0 border-r bg-surface-muted/50 lg:block">
    <nav aria-label="Dashboard navigation" className="sticky top-16 grid gap-1 p-4">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/patient" && href !== "/doctor" && pathname.startsWith(`${href}/`));
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", active && "bg-primary/10 text-primary")}> <Icon className="size-4" aria-hidden="true" />{label}</Link>;
      })}
    </nav>
  </aside>;
}
