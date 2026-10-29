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
import {
  getPublicDoctorSpecialties,
  parseDirectoryFilters,
  searchPublicDoctors,
} from "@/lib/discovery/directory";

export const instant = false;

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; specialty?: string }>;
}) {
  await connection();
  const filters = parseDirectoryFilters((await searchParams) ?? {});
  const [account, doctors, specialties] = await Promise.all([
    getCurrentAccount(),
    searchPublicDoctors(filters),
    getPublicDoctorSpecialties(),
  ]);
  const role =
    account?.onboardingComplete && account.profile?.full_name
      ? account.profile.role
      : undefined;

  return (
    <PortalShell role={role} name={account?.profile?.full_name ?? undefined}>
      <div className="grid gap-8">
        {/* Modernized Directory Header */}
        <div className="flex flex-col gap-2 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-2">
            <div className="inline-flex items-center gap-2">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Verified Medical Network
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Doctor Directory & Appointments
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Find verified healthcare specialists, review clinical credentials, and book appointments directly.
            </p>
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            Showing <strong className="text-foreground">{doctors.length}</strong> available{" "}
            {doctors.length === 1 ? "physician" : "physicians"}
          </div>
        </div>

        {/* Elevated Search & Filter Console */}
        <form
          method="get"
          className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_260px_auto] md:items-end"
        >
          <div className="grid gap-1.5">
            <label
              htmlFor="doctor-search"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Doctor or Keyword
            </label>
            <Input
              id="doctor-search"
              name="q"
              defaultValue={filters.search}
              placeholder="Search doctor by name or symptom..."
              className="h-10 bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <label
              htmlFor="doctor-specialty"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Medical Specialty
            </label>
            <CustomSelect
              id="doctor-specialty"
              name="specialty"
              defaultValue={filters.specialty}
              options={[
                { value: "", label: "All specialties" },
                ...specialties.map((specialty) => ({ value: specialty, label: specialty })),
              ]}
            />
          </div>
          <Button type="submit" className="h-10 gap-2 font-medium">
            <Search className="size-4" aria-hidden="true" />
            Search
          </Button>
        </form>

        {/* Practo-Style Quick Specialty Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/doctors"
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              !filters.specialty
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            All Specialties
          </Link>
          {specialties.map((spec) => {
            const isActive = filters.specialty?.toLowerCase() === spec.toLowerCase();
            return (
              <Link
                key={spec}
                href={`/doctors?specialty=${encodeURIComponent(spec)}`}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {spec}
              </Link>
            );
          })}
        </div>

        {/* 2-Column Clinical Split-Card Directory Grid */}
        {doctors.length ? (
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            {doctors.map((doctor) => (
              <DoctorDirectoryCard key={doctor.doctor_id} doctor={doctor} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No doctors found"
            description="Try searching for another name or specialty, or clear your current filters to view all profiles."
            action={
              <Button asChild variant="outline">
                <Link href="/doctors">Clear search</Link>
              </Button>
            }
          />
        )}
      </div>
    </PortalShell>
  );
}
