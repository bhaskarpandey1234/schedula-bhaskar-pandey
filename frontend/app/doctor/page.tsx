import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";
import { connection } from "next/server";

export const instant = false;

export default async function DoctorPage() { await connection(); const account = await requireRole("doctor"); return <PortalShell role="doctor" name={account.profile.full_name}><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Doctor portal</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Your practice, ready for what’s next.</h1><p className="mt-4 text-muted-foreground">Your profile is ready. Availability management and patient scheduling will be added in the next phases.</p></div></PortalShell>; }
