"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PendingLink({ href, children, className, ...props }: { href: string; children: React.ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const target = href;
  const active = pathname && target.startsWith(pathname) && target !== pathname ? false : pathname === target;
  return <Link href={href} {...props} aria-current={active ? "page" : undefined} aria-busy={pending} className={cn(className, pending && "pointer-events-none opacity-70")} onClick={(event) => { if (pending) { event.preventDefault(); return; } event.preventDefault(); startTransition(() => router.push(target)); }}>
    <span className="inline-flex items-center gap-2">{children}{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}</span>
  </Link>;
}
