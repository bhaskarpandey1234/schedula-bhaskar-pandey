import { Sparkles } from "lucide-react";
import type { AssistantRole } from "@/lib/assistant/types";

export function AssistantHeroArt({ className = "size-20 sm:size-24 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Robot Head Gradients */}
        <linearGradient id="robotHeadGrad" x1="20" y1="20" x2="70" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#EDF7F6" />
          <stop offset="100%" stopColor="#CFEAE6" />
        </linearGradient>
        <linearGradient id="robotVisorGrad" x1="25" y1="36" x2="65" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0B1E2B" />
          <stop offset="100%" stopColor="#153648" />
        </linearGradient>
        <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="60%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#0891B2" />
        </radialGradient>
        <linearGradient id="antennaGrad" x1="45" y1="12" x2="45" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>
        {/* Calendar Gradients */}
        <linearGradient id="calCardGrad" x1="65" y1="52" x2="105" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0FDFA" />
        </linearGradient>
        <linearGradient id="calHeaderGrad" x1="68" y1="55" x2="102" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        {/* Soft Drop Shadows */}
        <filter id="heroShadow" x="0" y="8" width="120" height="110" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0F766E" floodOpacity="0.14" />
        </filter>
        <filter id="calShadow" x="60" y="50" width="52" height="56" filterUnits="userSpaceOnUse">
          <feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="#042F2E" floodOpacity="0.18" />
        </filter>
      </defs>

      <g filter="url(#heroShadow)">
        {/* Antenna */}
        <path d="M45 23L45 15" stroke="#99F6E4" strokeWidth="3" strokeLinecap="round" />
        <circle cx="45" cy="13" r="4.5" fill="url(#antennaGrad)" />
        <circle cx="45" cy="13" r="2" fill="#E0F2FE" />

        {/* Robot Body */}
        <path
          d="M26 76C26 70 32 68 45 68C58 68 64 70 64 76V82C64 85 61 88 57 88H33C29 88 26 85 26 82V76Z"
          fill="url(#robotHeadGrad)"
          stroke="#99F6E4"
          strokeWidth="1.5"
        />
        <circle cx="45" cy="77" r="3.5" fill="#0D9488" opacity="0.3" />

        {/* Ears */}
        <rect x="15" y="40" width="6" height="12" rx="3" fill="#0D9488" />
        <rect x="69" y="40" width="6" height="12" rx="3" fill="#0D9488" />
        <circle cx="18" cy="46" r="1.5" fill="#67E8F9" />
        <circle cx="72" cy="46" r="1.5" fill="#67E8F9" />

        {/* Robot Head */}
        <rect
          x="19"
          y="23"
          width="52"
          height="45"
          rx="18"
          fill="url(#robotHeadGrad)"
          stroke="#CCFBF1"
          strokeWidth="2"
        />

        {/* Glossy highlight on forehead */}
        <path
          d="M28 28C32 25 58 25 62 28"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Visor Screen */}
        <rect x="25" y="33" width="40" height="25" rx="10" fill="url(#robotVisorGrad)" />

        {/* Glowing Eyes */}
        <ellipse cx="37" cy="44" rx="4.5" ry="5.5" fill="url(#eyeGlow)" />
        <ellipse cx="38" cy="42" rx="1.5" ry="2" fill="#FFFFFF" />

        <ellipse cx="53" cy="44" rx="4.5" ry="5.5" fill="url(#eyeGlow)" />
        <ellipse cx="54" cy="42" rx="1.5" ry="2" fill="#FFFFFF" />

        {/* Soft Smile */}
        <path
          d="M42 52C43.5 53.5 46.5 53.5 48 52"
          stroke="#67E8F9"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Cute blush cheeks */}
        <ellipse cx="30" cy="48" rx="2.5" ry="1.5" fill="#FDA4AF" opacity="0.4" />
        <ellipse cx="60" cy="48" rx="2.5" ry="1.5" fill="#FDA4AF" opacity="0.4" />
      </g>

      {/* Floating 3D Calendar Card */}
      <g filter="url(#calShadow)">
        <rect
          x="66"
          y="54"
          width="38"
          height="42"
          rx="8"
          fill="url(#calCardGrad)"
          stroke="#CCFBF1"
          strokeWidth="1.5"
        />
        {/* Calendar Top Header */}
        <path
          d="M66 62C66 57.5 69.5 54 74 54H96C100.5 54 104 57.5 104 62V65H66V62Z"
          fill="url(#calHeaderGrad)"
        />
        {/* Calendar rings */}
        <rect x="73" y="51" width="3" height="6" rx="1.5" fill="#14B8A6" />
        <rect x="83" y="51" width="3" height="6" rx="1.5" fill="#14B8A6" />
        <rect x="94" y="51" width="3" height="6" rx="1.5" fill="#14B8A6" />

        {/* Date grid dots */}
        <circle cx="74" cy="72" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="81" cy="72" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="88" cy="72" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="95" cy="72" r="1.5" fill="#0D9488" opacity="0.5" />

        <circle cx="74" cy="78" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="81" cy="78" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="88" cy="78" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="95" cy="78" r="1.5" fill="#0D9488" opacity="0.5" />

        <circle cx="74" cy="84" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="81" cy="84" r="1.5" fill="#0D9488" opacity="0.5" />
        <circle cx="88" cy="84" r="1.5" fill="#0D9488" opacity="0.5" />

        {/* Highlighted active day pill */}
        <circle cx="95" cy="84" r="3.5" fill="#0D9488" />
        <path d="M93.5 84L94.5 85L96.5 83" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Floating Sparkles */}
      <path
        d="M20 18L21 21L24 22L21 23L20 26L19 23L16 22L19 21L20 18Z"
        fill="#F59E0B"
        opacity="0.8"
      />
      <circle cx="76" cy="20" r="1.5" fill="#0D9488" opacity="0.6" />
      <path
        d="M104 42L105 44L107 45L105 46L104 48L103 46L101 45L103 44L104 42Z"
        fill="#14B8A6"
        opacity="0.75"
      />
    </svg>
  );
}
export function AssistantHeroBanner({ role }: { role: AssistantRole }) {
  const isDoctor = role === "doctor";

  return (
    <div className="relative shrink-0 overflow-hidden rounded-2xl border border-emerald-100/70 bg-gradient-to-r from-emerald-50/85 via-teal-50/60 to-cyan-50/45 px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-sm">
      {/* Decorative organic background curves */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-emerald-100/30 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-12 size-36 rounded-full bg-teal-100/35 blur-xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <AssistantHeroArt className="size-10 sm:size-11 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-emerald-800">
                {isDoctor ? "Doctor Workspace" : "Patient Hub"}
              </span>
              <span className="hidden sm:inline-block text-[11px] text-slate-500">·</span>
              <span className="hidden sm:inline-block text-[11px] text-slate-500 truncate">
                {isDoctor
                  ? "Today's appointments, availability & statistics"
                  : "Find doctors, slots & manage bookings"}
              </span>
            </div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base lg:text-lg truncate">
              {isDoctor ? "AI Scheduling Assistant" : "AI Care & Booking Assistant"}
            </h1>
          </div>
        </div>

        <div className="hidden shrink-0 md:block">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
            <Sparkles className="size-3 text-amber-500" aria-hidden="true" />
            <span>{isDoctor ? "Your smart scheduling helper" : "Your 24/7 care companion"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
