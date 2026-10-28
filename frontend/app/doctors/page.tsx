import Link from "next/link";
import { Search } from "lucide-react";
import { connection } from "next/server";
import { DoctorDirectoryCard } from "@/components/doctor-directory-card";
import { PortalShell } from "@/components/portal-shell";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { getCurrentAccount } from "@/lib/auth/guards";
import { getPublicDoctorSpecialties, parseDirectoryFilters, searchPublicDoctors } from "@/lib/discovery/directory";

export const instant = false;

export default async function DoctorsPage({ searchParams }: { searchParams?: Promise<{ q?: string; specialty?: string }> }) {
  await connection();
  const filters = parseDirectoryFilters((await searchParams) ?? {});
  const [account, doctors, specialties] = await Promise.all([getCurrentAccount(), searchPublicDoctors(filters), getPublicDoctorSpecialties()]);
  const role = account?.onboardingComplete && account.profile?.full_name ? account.profile.role : undefined;
  return <PortalShell role={role} name={account?.profile?.full_name ?? undefined}><div className="grid gap-7">
    <div className="grid gap-3"><p className="text-sm font-semibold text-primary">Doctor directory</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find a doctor and choose a time.</h1><p className="max-w-2xl text-muted-foreground">Search verified professional profiles and view their upcoming availability.</p></div>
    <form method="get" className="grid gap-3 rounded-xl border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_260px_auto] md:items-end"><div className="grid gap-2"><label htmlFor="doctor-search" className="text-sm font-medium">Doctor name</label><Input id="doctor-search" name="q" defaultValue={filters.search} placeholder="Search by name" /></div><div className="grid gap-2"><label htmlFor="doctor-specialty" className="text-sm font-medium">Specialty</label><CustomSelect id="doctor-specialty" name="specialty" defaultValue={filters.specialty} options={[{ value: "", label: "All specialties" }, ...specialties.map((specialty) => ({ value: specialty, label: specialty }))]} /></div><Button type="submit"><Search className="size-4" aria-hidden="true" />Search</Button></form>
    {doctors.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{doctors.map((doctor) => <DoctorDirectoryCard key={doctor.doctor_id} doctor={doctor} />)}</div> : <EmptyState title="No doctors found" description="Try another name or specialty, or browse all currently available profiles." action={<Button asChild variant="outline"><Link href="/doctors">Clear search</Link></Button>} />}
  </div></PortalShell>;
}
