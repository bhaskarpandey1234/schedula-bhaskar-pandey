import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

export function AuthShell({ children }: { children: React.ReactNode }) { return <main className="min-h-svh bg-background py-8"><PageContainer className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center"><Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-75"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Stethoscope aria-hidden="true" className="size-5" /></span><span className="text-lg">Schedula</span></Link><div className="w-full max-w-md">{children}</div></PageContainer></main>; }
