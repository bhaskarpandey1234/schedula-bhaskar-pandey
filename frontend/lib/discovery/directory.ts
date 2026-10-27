import { createClient } from "@/lib/supabase/server";
import { formatLocalTime, localDateKey as getLocalDateKey } from "@/lib/scheduling/time";

export type DirectoryFilters = { search: string; specialty: string };

export type DoctorDirectoryRecord = {
  doctor_id: string;
  full_name: string;
  specialty: string;
  clinic_name: string;
  experience_years: number;
  available_dates: string[];
};

export type DoctorDetailRecord = DoctorDirectoryRecord & {
  biography: string;
  timezone: string;
};

export type DoctorSlot = {
  slot_id: string;
  slot_start_at: string;
  slot_end_at: string;
  timezone: string;
  capacity: number;
  remaining_capacity: number;
};

export function parseDirectoryFilters(params: { q?: string; specialty?: string } | URLSearchParams): DirectoryFilters {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) : params[key as keyof typeof params];
  return {
    search: (get("q") ?? "").trim().slice(0, 100),
    specialty: (get("specialty") ?? "").trim().slice(0, 100),
  };
}

async function patientRpc<T>(fn: string, args?: Record<string, string | null>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`Doctor discovery query failed: ${error.message}`);
  return (data ?? []) as T;
}

export async function getDoctorSpecialties() {
  const data = await patientRpc<Array<{ specialty: string }>>("patient_doctor_specialties");
  return data.map((row) => row.specialty);
}

export async function searchDoctors(filters: DirectoryFilters) {
  return patientRpc<DoctorDirectoryRecord[]>("patient_doctor_directory", {
    p_search: filters.search || null,
    p_specialty: filters.specialty || null,
  });
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getDoctorDetail(doctorId: string) {
  const data = await patientRpc<DoctorDetailRecord[]>("patient_doctor_detail", { p_doctor_id: doctorId });
  return data[0] ?? null;
}

export async function getDoctorSlots(doctorId: string) {
  return patientRpc<DoctorSlot[]>("patient_doctor_slots", { p_doctor_id: doctorId });
}

export function localDateKey(value: string | Date, timezone: string) {
  return getLocalDateKey(value, timezone);
}

export function formatDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatSlotTime(value: string, timezone: string) {
  return formatLocalTime(value, timezone);
}

export function groupSlotsByDate(slots: DoctorSlot[], timezone: string) {
  const groups = new Map<string, DoctorSlot[]>();
  for (const slot of slots) {
    const key = localDateKey(slot.slot_start_at, timezone);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups.entries()].map(([date, dateSlots]) => ({ date, label: formatDateLabel(date), slots: dateSlots }));
}
