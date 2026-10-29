import Link from "next/link";
import { ArrowRight, Smartphone, Stethoscope } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

export function SiteFooter() {
  return (
    <footer className="bg-[#1D2153] text-white">
      <PageContainer className="py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          {/* Brand & Platform Summary */}
          <div className="space-y-4 md:col-span-5">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-white">
                <Stethoscope className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xl font-bold tracking-tight text-white">Schedula</span>
            </Link>
            <p className="text-xs leading-relaxed text-white/75 max-w-sm">
              Smart hospital appointment scheduling system. Find verified doctors across 12+ specialties, check real-time clinic availability, and book confirmed visits.
            </p>
          </div>

          {/* Column: For Patients */}
          <div className="space-y-3 md:col-span-3">
            <h3 className="text-sm font-bold text-white tracking-wide">For Patients</h3>
            <ul className="space-y-2 text-xs text-white/75">
              <li>
                <Link href="/doctors" className="hover:text-white transition-colors">
                  Find Doctors
                </Link>
              </li>
              <li>
                <Link href="/#browse-care" className="hover:text-white transition-colors">
                  Browse Specialties
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="hover:text-white transition-colors">
                  Patient Sign In
                </Link>
              </li>
              <li>
                <Link href="/auth/sign-up" className="hover:text-white transition-colors">
                  Create Account
                </Link>
              </li>
            </ul>
          </div>

          {/* Column: For Doctors */}
          <div className="space-y-3 md:col-span-2">
            <h3 className="text-sm font-bold text-white tracking-wide">For Doctors</h3>
            <ul className="space-y-2 text-xs text-white/75">
              <li>
                <Link href="/auth/sign-up" className="hover:text-white transition-colors">
                  Join as Doctor
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="hover:text-white transition-colors">
                  Doctor Sign In
                </Link>
              </li>
              <li>
                <Link href="/doctor/schedule" className="hover:text-white transition-colors">
                  Manage Schedule
                </Link>
              </li>
            </ul>
          </div>

          {/* Column: Mobile App */}
          <div className="space-y-3 md:col-span-2">
            <h3 className="text-sm font-bold text-white tracking-wide">Mobile App</h3>
            <div className="space-y-2 text-xs text-white/75">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-400/30">
                <Smartphone className="size-3" />
                Coming Soon
              </span>
              <p className="text-[11px] leading-relaxed text-white/60">
                Dedicated apps for iOS and Android are in development.
              </p>
              <Link
                href="/#app-download"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-300 hover:text-white transition-colors pt-1"
              >
                <span>Get early access</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Tagline */}
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col items-center justify-between gap-3 text-xs text-white/60 sm:flex-row">
          <p>© 2026 Schedula. Hospital Appointment Scheduling System.</p>
          <p className="text-[11px]">Clean, verified, patient-first healthcare scheduling.</p>
        </div>
      </PageContainer>
    </footer>
  );
}
