import { createClient } from "@/lib/supabase/server";
import { formatLocalTime, localDateKey as getLocalDateKey } from "@/lib/scheduling/time";
import { type DirectoryFilters } from "@/lib/discovery/filters";
import { formatDateLabel } from "@/lib/discovery/format";
import type { DoctorDirectoryRecord, DoctorDetailRecord, DoctorSlot } from "@/lib/discovery/types";
import {
  DUMMY_SPECIALTIES,
  getDummyDoctorDetail,
  getDummyDoctorSlots,
  mergeWithDummyDoctors,
} from "./mock-doctors";

export { parseDirectoryFilters, type DirectoryFilters } from "@/lib/discovery/filters";
export { formatDateLabel } from "@/lib/discovery/format";
export type { DoctorDirectoryRecord, DoctorDetailRecord, DoctorSlot } from "@/lib/discovery/types";
export {
  DUMMY_SPECIALTIES,
  getDummyDoctors,
  getDummyDoctorDetail,
  getDummyDoctorSlots,
  mergeWithDummyDoctors,
} from "./mock-doctors";

async function patientRpc<T>(fn: string, args?: Record<string, string | null>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`Doctor discovery query failed: ${error.message}`);
  return (data ?? []) as T;
}

async function publicRpc<T>(fn: string, args?: Record<string, string | null>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // Keep the public shell available while a hosted Supabase project is
    // catching up with the discovery migration. The directory then renders
    // its normal empty state instead of turning the whole page into a 500.
    if (
      error.message.toLowerCase().includes("schema cache") ||
      error.message.toLowerCase().includes("does not exist")
    ) {
      console.warn(
        `Public discovery function ${fn} is unavailable; returning an empty result until migrations are applied.`
      );
      return [] as T;
    }
    throw new Error(`Public doctor discovery query failed: ${error.message}`);
  }
  return (data ?? []) as T;
}

export async function getPublicDoctorSpecialties() {
  const data = await publicRpc<Array<{ specialty: string }>>("public_doctor_specialties").catch(
    () => []
  );
  const dbSpecialties = data.map((row) => row.specialty);
  return Array.from(new Set([...dbSpecialties, ...DUMMY_SPECIALTIES])).sort();
}

export async function searchPublicDoctors(filters: DirectoryFilters) {
  const dbDoctors = await publicRpc<DoctorDirectoryRecord[]>("public_doctor_directory", {
    p_search: filters.search || null,
    p_specialty: filters.specialty || null,
  }).catch(() => []);

  return mergeWithDummyDoctors(dbDoctors, filters);
}

export async function getPublicDoctorDetail(doctorId: string) {
  const data = await publicRpc<DoctorDetailRecord[]>("public_doctor_detail", {
    p_doctor_id: doctorId,
  }).catch(() => []);

  if (data && data[0]) return data[0];
  return getDummyDoctorDetail(doctorId);
}

export async function getPublicDoctorSlots(doctorId: string) {
  const data = await publicRpc<DoctorSlot[]>("public_doctor_slots", {
    p_doctor_id: doctorId,
  }).catch(() => []);

  if (data && data.length > 0) return data;
  return getDummyDoctorSlots(doctorId);
}

export async function getDoctorSpecialties() {
  const data = await patientRpc<Array<{ specialty: string }>>("patient_doctor_specialties").catch(
    () => []
  );
  const dbSpecialties = data.map((row) => row.specialty);
  return Array.from(new Set([...dbSpecialties, ...DUMMY_SPECIALTIES])).sort();
}

export async function searchDoctors(filters: DirectoryFilters) {
  const dbDoctors = await patientRpc<DoctorDirectoryRecord[]>("patient_doctor_directory", {
    p_search: filters.search || null,
    p_specialty: filters.specialty || null,
  }).catch(() => []);

  return mergeWithDummyDoctors(dbDoctors, filters);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getDoctorDetail(doctorId: string) {
  const data = await patientRpc<DoctorDetailRecord[]>("patient_doctor_detail", {
    p_doctor_id: doctorId,
  }).catch(() => []);

  if (data && data[0]) return data[0];
  return getDummyDoctorDetail(doctorId);
}

export async function getDoctorSlots(doctorId: string) {
  const data = await patientRpc<DoctorSlot[]>("patient_doctor_slots", {
    p_doctor_id: doctorId,
  }).catch(() => []);

  if (data && data.length > 0) return data;
  return getDummyDoctorSlots(doctorId);
}

export function localDateKey(value: string | Date, timezone: string) {
  return getLocalDateKey(value, timezone);
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
  return [...groups.entries()].map(([date, dateSlots]) => ({
    date,
    label: formatDateLabel(date),
    slots: dateSlots,
  }));
}
