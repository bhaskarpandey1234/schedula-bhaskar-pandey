import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, CalendarDays, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { CareAreaCarousel } from "@/components/care-area-carousel";
import { DoctorCarousel } from "@/components/doctor-carousel";
import { PageContainer } from "@/components/layout/page-container";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentAccount } from "@/lib/auth/guards";
import { getPublicDoctorSpecialties, searchPublicDoctors } from "@/lib/discovery/directory";

export const instant = false;

const fallbackSpecialties = ["Cardiology", "Dermatology", "Pediatrics", "General Medicine", "Orthopedics", "Gynecology"];

export default async function Home() {
  await connection();
  const [account, specialties, doctors] = await Promise.all([getCurrentAccount(), getPublicDoctorSpecialties(), searchPublicDoctors({ search: "", specialty: "" })]);
  const role = account?.onboardingComplete && account.profile?.full_name ? account.profile.role : undefined;
  const displaySpecialties = specialties.length ? specialties : fallbackSpecialties;

  return <div className={`min-h-screen ${role === "patient" ? "[--primary:210_80%_45%] [--ring:210_80%_45%]" : role === "doctor" ? "[--primary:174_72%_31%] [--ring:174_72%_31%]" : ""}`}>
    <SiteHeader role={role} name={account?.profile?.full_name ?? undefined} />
    <main>
      <section data-testid="hero" className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden border-b">
        <Image src="/images/appointment-hero.png" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-slate-950/65" />
        <PageContainer className="w-full py-12 sm:py-16"><div className="max-w-3xl text-white">
          <p className="text-sm font-medium text-white/80">Care that fits your day</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Find a doctor. Book with confidence.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/80">Search verified profiles and upcoming appointment times in one place.</p>
          <form action="/doctors" className="mt-8 grid gap-3 rounded-xl bg-white p-3 text-foreground shadow-xl md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <div className="grid gap-1"><label htmlFor="home-search" className="text-xs font-medium text-muted-foreground">Doctor name</label><input id="home-search" name="q" placeholder="Search by name" className="h-10 bg-transparent px-1 text-sm outline-none" /></div>
            <div className="grid gap-1"><label htmlFor="home-specialty" className="text-xs font-medium text-muted-foreground">Specialty</label><CustomSelect id="home-specialty" name="specialty" defaultValue="" options={[{ value: "", label: "All specialties" }, ...displaySpecialties.map((specialty) => ({ value: specialty, label: specialty }))]} /></div>
            <Button type="submit" className="md:self-end"><Search className="size-4" aria-hidden="true" />Find doctors</Button>
          </form>
        </div></PageContainer>
      </section>

      <section id="browse-care" className="border-b bg-surface-muted py-10 sm:py-12"><PageContainer>
        <div className="mb-5"><p className="text-sm font-medium text-primary">Browse care</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Find the right care for you</h2></div>
        <CareAreaCarousel specialties={displaySpecialties} />
      </PageContainer></section>

      <section className="py-10 sm:py-12"><PageContainer>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Available now</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Doctors with upcoming times</h2></div><Button asChild variant="outline"><Link href="/doctors">View all <ArrowRight className="size-4" aria-hidden="true" /></Link></Button></div>
        <DoctorCarousel doctors={doctors} showDemo={doctors.length === 0} />
      </PageContainer></section>

      <section id="for-doctors" className="py-10"><PageContainer className="flex flex-col gap-4 rounded-xl border bg-surface-muted p-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Stethoscope className="size-5" aria-hidden="true" /></span><div><h2 className="font-semibold">For doctors</h2><p className="mt-1 text-sm text-muted-foreground">Publish your profile and availability in one workspace.</p></div></div><Button asChild><Link href="/auth/sign-up">Join Schedula <CalendarDays className="size-4" /></Link></Button></PageContainer></section>
    </main>
    <SiteFooter />
  </div>;
}
