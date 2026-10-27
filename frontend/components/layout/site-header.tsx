"use client";

import { Menu, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-patients", label: "For patients" },
  { href: "#for-doctors", label: "For doctors" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <PageContainer className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope aria-hidden="true" className="size-5" />
          </span>
          <span className="text-lg">Schedula</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm"><Link href="/auth/login">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/auth/sign-up">Get started</Link></Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}><SheetTrigger className="md:hidden" aria-label="Open navigation"><Button type="button" size="icon" variant="outline"><Menu aria-hidden="true" /></Button></SheetTrigger><SheetContent id="mobile-navigation"><PageContainer className="flex flex-col gap-2 py-4"><div className="mb-4 flex items-center justify-between"><span className="font-semibold">Menu</span><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>{links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">{link.label}</Link>)}<div className="mt-2 grid grid-cols-2 gap-2 border-t pt-4"><Button asChild variant="outline"><Link href="/auth/login">Sign in</Link></Button><Button asChild><Link href="/auth/sign-up">Get started</Link></Button></div></PageContainer></SheetContent></Sheet>
      </PageContainer>
    </header>
  );
}
