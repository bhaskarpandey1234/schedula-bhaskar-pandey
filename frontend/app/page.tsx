import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, CalendarDays, MapPin, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { AppDownloadBanner } from "@/components/app-download-banner";
import { DoctorCarousel } from "@/components/doctor-carousel";
import { HealthConcernTiles } from "@/components/health-concern-tiles";
import { HeroServicesCards } from "@/components/hero-services-cards";
import { InClinicSpecialties } from "@/components/in-clinic-specialties";
import { PageContainer } from "@/components/layout/page-container";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentAccount } from "@/lib/auth/guards";
import { getPublicDoctorSpecialties, searchPublicDoctors } from "@/lib/discovery/directory";

export const instant = false;

const fallbackSpecialties = [
  "Dentist",
  "Gynecology",
  "Dietitian",
  "Physiotherapy",
  "General Medicine",
  "Pediatrics",
  "Dermatology",
  "Cardiology",
  "Orthopedic Surgery",
  "Neurology",
  "Psychiatry",
  "Ophthalmology",
];

export default async function Home() {
  await connection();
  const [account, specialties, doctors] = await Promise.all([
    getCurrentAccount(),
    getPublicDoctorSpecialties(),
    searchPublicDoctors({ search: "", specialty: "" }),
  ]);
  const role =
    account?.onboardingComplete && account.profile?.full_name
      ? account.profile.role
      : undefined;
  const displaySpecialties = specialties.length ? specialties : fallbackSpecialties;

  return (
    <div
      className={`min-h-screen bg-[#FBFBFC] ${
        role === "patient"
          ? "[--primary:210_80%_45%] [--ring:210_80%_45%]"
          : role === "doctor"
          ? "[--primary:174_72%_31%] [--ring:174_72%_31%]"
          : ""
      }`}
    >
      <SiteHeader role={role} name={account?.profile?.full_name ?? undefined} />

      <main>
        {/* Practo-Style Top Hero & Search Console */}
        <section
          data-testid="hero"
          className="relative border-b border-border/50 bg-gradient-to-b from-white via-slate-50/50 to-white py-8 sm:py-12"
        >
          <PageContainer className="w-full">
            {/* Dual Pill Search Console (Practo Exact Top Bar) */}
            <div className="mx-auto max-w-4xl mb-10">
              <form
                action="/doctors"
                className="flex flex-col sm:flex-row items-stretch rounded-2xl border border-slate-300 bg-white p-2 shadow-lg md:rounded-full"
              >
                {/* Location Pill */}
                <div className="flex items-center gap-2.5 px-4 py-2.5 sm:border-r border-slate-200 sm:w-56 shrink-0">
                  <MapPin className="size-4 text-slate-500 shrink-0" aria-hidden="true" />
                  <input
                    type="text"
                    defaultValue="Bangalore"
                    placeholder="Location"
                    aria-label="City or Location"
                    className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>

                {/* Doctor or Keyword Search Pill */}
                <div className="flex flex-1 items-center gap-2.5 px-4 py-2.5">
                  <Search className="size-4 text-slate-500 shrink-0" aria-hidden="true" />
                  <input
                    id="home-search"
                    name="q"
                    placeholder="Search doctors, clinics, hospitals, etc."
                    className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>

                {/* Hidden Specialty selector preserving form contract */}
                <div className="hidden">
                  <CustomSelect
                    id="home-specialty"
                    name="specialty"
                    defaultValue=""
                    options={[
                      { value: "", label: "All specialties" },
                      ...displaySpecialties.map((specialty) => ({
                        value: specialty,
                        label: specialty,
                      })),
                    ]}
                  />
                </div>

                {/* Find Doctors Button */}
                <Button
                  type="submit"
                  className="mt-2 sm:mt-0 rounded-xl md:rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-sm"
                >
                  <Search className="size-4 mr-2" aria-hidden="true" />
                  Find doctors
                </Button>
              </form>
            </div>

            {/* 4 Pastel Hero Service Cards (Practo Signature Layout) */}
            <HeroServicesCards />
          </PageContainer>
        </section>

        {/* Practo Tier 1: "Consult top doctors for any health concern" (Circular Tiles) */}
        <div id="browse-care">
          <PageContainer>
          <HealthConcernTiles />
          </PageContainer>
        </div>

        {/* Practo Tier 2: "Book an appointment for an in-clinic consultation" (Procedure Cards Carousel) */}
        <PageContainer>
          <InClinicSpecialties />
        </PageContainer>

        {/* Practo Tier 3: "Doctors with upcoming times" (Split-Card Physician Carousel) */}
        <section className="py-12 sm:py-16 bg-white border-b border-border/60">
          <PageContainer>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Available now
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1D2153] sm:text-3xl">
                  Doctors with upcoming times
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Verified medical specialists available for same-day and upcoming appointments
                </p>
              </div>
              <Button asChild variant="outline" className="border-primary/60 text-primary font-semibold hover:bg-primary/5">
                <Link href="/doctors">
                  View all doctors <ArrowRight className="size-4 ml-1" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <DoctorCarousel doctors={doctors} showDemo={doctors.length === 0} />
          </PageContainer>
        </section>

        {/* Practo Tier 4: "Download the Schedula app" Banner (Mockup + SMS Sender) */}
        <AppDownloadBanner />

        {/* For Doctors Callout Strip */}
        <section id="for-doctors" className="py-10 bg-slate-50 border-b border-border/60">
          <PageContainer className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between shadow-sm">
            <div className="flex gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Stethoscope className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#1D2153]">Are you a doctor?</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Publish your profile, set your clinic availability, and connect with patients across India.
                </p>
              </div>
            </div>
            <Button asChild className="rounded-xl font-semibold">
              <Link href="/auth/sign-up">
                Join Schedula Pro <CalendarDays className="size-4 ml-2" />
              </Link>
            </Button>
          </PageContainer>
        </section>
      </main>

      {/* Practo Signature Deep Navy Footer */}
      <SiteFooter />
    </div>
  );
}
