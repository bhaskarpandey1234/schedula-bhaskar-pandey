import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";
import { connection } from "next/server";

export const instant = false;

export default async function PatientPage() { await connection(); const account = await requireRole("patient"); return <PortalShell role="patient" name={account.profile.full_name}><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Patient portal</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Your care, in one clear place.</h1><p className="mt-4 text-muted-foreground">Your profile is ready. Doctor discovery and appointment booking will be added in the next phases.</p></div></PortalShell>; }
