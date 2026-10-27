import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

export function AuthShell({ children }: { children: React.ReactNode }) { return <main className="min-h-svh bg-gradient-to-b from-accent/50 to-background py-10"><PageContainer className="flex min-h-[calc(100svh-5rem)] flex-col items-center justify-center"><Link href="/" className="mb-8 flex items-center gap-2 font-semibold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Stethoscope aria-hidden="true" className="size-5" /></span><span className="text-lg">Schedula</span></Link><div className="w-full max-w-sm">{children}</div></PageContainer></main>; }
