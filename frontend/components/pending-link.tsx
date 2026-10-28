"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PendingLink({ href, children, className, active: explicitActive, ...props }: { href: string; children: React.ReactNode; className?: string; active?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const target = href;
  const [targetPath, targetQuery = ""] = target.split("?");
  const active = explicitActive ?? (pathname === targetPath && targetQuery === searchParams.toString());
  return <Link href={href} {...props} aria-current={active ? "page" : undefined} aria-busy={pending} className={cn(className, pending && "pointer-events-none opacity-70")} onClick={(event) => { if (pending) { event.preventDefault(); return; } event.preventDefault(); startTransition(() => router.push(target)); }}>
    <span className="inline-flex items-center gap-2">{children}{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}</span>
  </Link>;
}
