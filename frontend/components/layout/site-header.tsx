"use client";

import { Bell, Menu, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Phase3LogoutButton } from "@/components/phase3-logout-button";
import { PageContainer } from "@/components/layout/page-container";
import { PendingLink } from "@/components/pending-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { Role } from "@/lib/validation/auth";

type NavigationLink = { href: string; label: string };

function linksFor(role?: Role): NavigationLink[] {
  if (role === "patient")
    return [
      { href: "/", label: "Home" },
      { href: "/patient", label: "Dashboard" },
      { href: "/doctors", label: "Find Doctors" },
      { href: "/patient/appointments", label: "Appointments" },
      { href: "/patient/profile", label: "Profile" },
    ];
  if (role === "doctor")
    return [
      { href: "/", label: "Home" },
      { href: "/doctor", label: "Dashboard" },
      { href: "/doctor/schedule", label: "Schedule" },
      { href: "/doctor/appointments", label: "Appointments" },
      { href: "/doctor/profile", label: "Profile" },
    ];
  return [
    { href: "/doctors", label: "Find Doctors" },
    { href: "/#browse-care", label: "Browse care" },
    { href: "/doctors", label: "Book Appointment" },
  ];
}

export function SiteHeader({ role, name, unreadCount = 0 }: { role?: Role; name?: string; unreadCount?: number }) {
  const [open, setOpen] = useState(false);
  const links = linksFor(role);
  const home = "/";
  const navigation = (mobile = false) =>
    links.map((link) => (
      <PendingLink
        key={link.href + link.label}
        href={link.href}
        onClick={() => mobile && setOpen(false)}
        className={
          mobile
            ? "rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-accent"
            : "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        {link.label}
      </PendingLink>
    ));

  return <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
    <PageContainer className="flex h-16 items-center justify-between gap-4">
      <Link href={home} className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Stethoscope aria-hidden="true" className="size-5" /></span>
        <span className="text-lg">Schedula</span>
      </Link>
      <nav aria-label="Primary navigation" className="hidden flex-1 items-center justify-center gap-7 md:flex">{navigation()}</nav>
      <div className="hidden items-center gap-2 md:flex">
        {role ? <><Link href={`/${role}/notifications`} aria-label="Notifications" className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{unreadCount > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}<Bell className="size-4" aria-hidden="true" /></Link><span className="max-w-44 truncate text-sm text-muted-foreground">{name}</span><Phase3LogoutButton /></> : <><Button asChild variant="ghost" size="sm"><Link href="/auth/login">Sign in</Link></Button><Button asChild size="sm"><Link href="/auth/sign-up">Create account</Link></Button></>}
      </div>
      <Sheet open={open} onOpenChange={setOpen}><SheetTrigger className="inline-flex size-9 items-center justify-center rounded-md border border-input text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden" aria-label="Open navigation"><Menu className="size-4" aria-hidden="true" /></SheetTrigger><SheetContent id="mobile-navigation"><div className="flex h-full flex-col"><div className="mb-5 flex items-center justify-between"><span className="font-semibold">Menu</span><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button></div><nav aria-label="Mobile navigation" className="grid gap-1">{navigation(true)}</nav><div className="mt-auto grid gap-2 border-t pt-4">{role ? <><p className="px-3 text-sm text-muted-foreground">{name}</p><Phase3LogoutButton /></> : <><Button asChild variant="outline"><Link href="/auth/login">Sign in</Link></Button><Button asChild><Link href="/auth/sign-up">Create account</Link></Button></>}</div></div></SheetContent></Sheet>
    </PageContainer>
  </header>;
}
