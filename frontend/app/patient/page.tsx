import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { connection } from "next/server";
import Link from "next/link";

export const instant = false;

export default async function PatientPage() { await connection(); const account = await requireRole("patient"); return <PortalShell role="patient" name={account.profile.full_name}><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Patient portal</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Your care, in one clear place.</h1><p className="mt-4 text-muted-foreground">Find a doctor by name or specialty, review their profile, and explore upcoming availability.</p><Button asChild className="mt-6"><Link href="/patient/doctors">Find a doctor</Link></Button></div></PortalShell>; }
