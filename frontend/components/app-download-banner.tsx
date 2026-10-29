"use client";

import { useState } from "react";
import {
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  MapPin,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppDownloadBanner() {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length >= 10) {
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    }
  };

  return (
    <section id="app-download" className="border-b border-border/60 bg-white py-14 sm:py-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          {/* Left Column: Mobile App Interface Mockup (Appointment Booking) */}
          <div className="relative mx-auto flex w-full max-w-sm justify-center lg:col-span-5">
            <div className="relative h-[460px] w-[260px] sm:h-[490px] sm:w-[280px] rounded-[2.5rem] border-[6px] border-slate-900 bg-slate-950 p-2.5 shadow-2xl ring-1 ring-slate-900/10">
              {/* Phone Camera Notch */}
              <div className="absolute top-4 left-1/2 h-4 w-28 -translate-x-1/2 rounded-full bg-slate-900 z-20" />

              {/* Screen Content: Schedula Mobile App UI */}
              <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-slate-50 flex flex-col justify-between p-4 pt-10 text-slate-800">
                {/* App Screen Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1D2153]">Schedula App</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 border border-amber-300">
                      Coming Soon
                    </span>
                  </div>

                  {/* Confirmed Appointment Card inside Mockup */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <CalendarCheck2 className="size-4" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-800">Appointment Confirmed</p>
                        <p className="text-[9px] text-emerald-600 font-semibold">Ready for in-clinic visit</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-2 space-y-1 text-[10px] text-slate-600">
                      <p className="font-semibold text-slate-900">Dr. Sarah Johnson, MD</p>
                      <p className="text-slate-500">Cardiology Specialist</p>
                      <div className="flex items-center gap-1 text-[9px] text-slate-500 pt-0.5">
                        <MapPin className="size-3 text-primary shrink-0" />
                        <span className="truncate">City Heart Center, Suite 400</span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-slate-500">
                        <Clock className="size-3 text-primary shrink-0" />
                        <span>Thursday, 10:30 AM</span>
                      </div>
                    </div>
                  </div>

                  {/* Doctor Discovery Pill in Mockup */}
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-2.5 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 font-medium text-primary">
                      <ShieldCheck className="size-3.5" />
                      <span>12+ Medical Specialties</span>
                    </div>
                    <span className="text-[9px] font-semibold text-slate-600">Book Instantly</span>
                  </div>
                </div>

                {/* Bottom App Reminder Pill in Mockup */}
                <div className="rounded-xl bg-slate-900 p-2.5 text-center text-white space-y-1">
                  <p className="text-[10px] font-semibold">Appointment Reminders</p>
                  <p className="text-[8px] text-white/70">Instant SMS & calendar sync on mobile</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Coming Soon Copy + Waitlist SMS input */}
          <div className="flex flex-col justify-center lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200/90 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-sm">
                <Smartphone className="size-3.5 text-amber-600" />
                <span>Mobile App — Coming Soon</span>
              </div>

              <h2 className="text-3xl font-bold tracking-tight text-[#1D2153] sm:text-4xl">
                Experience Schedula on your phone
              </h2>

              <p className="text-sm sm:text-base leading-relaxed text-slate-600 max-w-xl">
                We are actively building the dedicated Schedula mobile app for iOS and Android.
                Book clinic visits in seconds, keep upcoming appointments in view, and receive
                instant visit reminders right from your pocket.
              </p>
            </div>

            {/* Waitlist SMS Form */}
            <div className="space-y-2 pt-1">
              <label
                htmlFor="app-phone"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"
              >
                <BellRing className="size-3.5 text-primary" />
                Get notified when the mobile app launches
              </label>

              {sent ? (
                <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 p-4 border border-emerald-200 text-emerald-800 text-sm font-medium">
                  <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                  <span>
                    You are on the early access list! We will send a download link to +91 {phone} as soon as we launch.
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col sm:flex-row items-stretch gap-2 max-w-lg"
                >
                  <div className="flex rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent flex-1">
                    <span className="inline-flex items-center bg-slate-100 px-3.5 text-sm font-semibold text-slate-700 border-r border-slate-200">
                      +91
                    </span>
                    <input
                      id="app-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter 10-digit mobile number"
                      pattern="[0-9]{10}"
                      required
                      className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-800 outline-none"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="bg-[#14BEF0] hover:bg-[#0EA5D3] text-white font-bold px-6 rounded-xl shadow-sm h-11 shrink-0"
                  >
                    <Send className="size-4 mr-1.5" />
                    Notify Me
                  </Button>
                </form>
              )}
            </div>

            {/* App Badges with Coming Soon note */}
            <div className="pt-2">
              <p className="text-xs font-medium text-slate-500 mb-3 flex items-center gap-2">
                <span>Coming Soon on iOS and Android:</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  In Development
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {/* Google Play Pill */}
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-900/90 px-4 py-2 text-white shadow opacity-90">
                  <svg className="size-5 fill-current" viewBox="0 0 24 24">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a1.99 1.99 0 0 1-.22-.924V2.738c0-.348.08-.671.219-.924zm11.39 11.393l2.298 2.297-12.01 6.942 9.712-9.239zm2.298-2.414l-2.298 2.297L5.287 3.851l12.01 6.942zm1.205 1.207l2.802 1.62c.792.457.792 1.204 0 1.661l-2.802 1.62-2.12-2.45 2.12-2.451z" />
                  </svg>
                  <div className="text-left">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">
                      COMING TO
                    </p>
                    <p className="text-xs font-semibold leading-tight mt-0.5">
                      Google Play
                    </p>
                  </div>
                </div>

                {/* App Store Pill */}
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-900/90 px-4 py-2 text-white shadow opacity-90">
                  <svg className="size-5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.78 1.06-1.85.94-2.94-.92.04-2.02.61-2.67 1.39-.58.67-1.09 1.77-.95 2.83 1.03.08 2.05-.5 2.68-1.28z" />
                  </svg>
                  <div className="text-left">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">
                      COMING TO
                    </p>
                    <p className="text-xs font-semibold leading-tight mt-0.5">
                      App Store
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
