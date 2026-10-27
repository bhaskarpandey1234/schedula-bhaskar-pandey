import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorSpecialties, parseDirectoryFilters, searchDoctors } from "@/lib/discovery/directory";
import { DoctorDirectoryCard } from "@/components/doctor-directory-card";
import { PortalShell } from "@/components/portal-shell";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export const instant = false;

export default async function DoctorDirectoryPage({ searchParams }: { searchParams?: Promise<{ q?: string; specialty?: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const filters = parseDirectoryFilters((await searchParams) ?? {});
  const [doctors, specialties] = await Promise.all([searchDoctors(filters), getDoctorSpecialties()]);
  return <PortalShell role="patient" name={account.profile.full_name}><div className="grid gap-8">
    <div><Link href="/patient" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Patient portal</Link><p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Doctor directory</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Find the right doctor for your care.</h1><p className="mt-4 max-w-2xl text-muted-foreground">Search profiles and review upcoming availability before you choose a time.</p></div>
    <form method="get" className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-[1fr_240px_auto] md:items-end"><div className="grid gap-2"><label htmlFor="doctor-search" className="text-sm font-medium">Search by doctor name</label><Input id="doctor-search" name="q" defaultValue={filters.search} placeholder="e.g. Dr. Asha Rao" /></div><div className="grid gap-2"><label htmlFor="doctor-specialty" className="text-sm font-medium">Specialty</label><Select id="doctor-specialty" name="specialty" defaultValue={filters.specialty}><option value="">All specialties</option>{specialties.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}</Select></div><Button type="submit"><Search className="mr-2 size-4" aria-hidden="true" />Search</Button></form>
    {doctors.length === 0 ? <EmptyState title="No doctors found" description="Try a different name or specialty, or clear the filters to browse all doctor profiles." action={<Button asChild variant="outline"><Link href="/patient/doctors">Clear filters</Link></Button>} /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{doctors.map((doctor) => <DoctorDirectoryCard key={doctor.doctor_id} doctor={doctor} />)}</div>}
  </div></PortalShell>;
}
