import { localDateKey } from "@/lib/scheduling/time";

export const scheduleFilterOptions = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "specific", label: "Specific date" },
] as const;

export type ScheduleFilter = (typeof scheduleFilterOptions)[number]["value"];
export type ScheduleFilterSelection = { filter: ScheduleFilter; date?: string };

type ScheduleSearchParams = { filter?: string; date?: string };
type ScheduleSlot = { slot_start_at: string; slot_end_at: string };

export function isValidDateKey(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseScheduleFilter(params: ScheduleSearchParams): ScheduleFilterSelection {
  if (params.filter === "all" || params.filter === "upcoming" || params.filter === "past") {
    return { filter: params.filter };
  }
  if (params.filter === "specific" && isValidDateKey(params.date)) {
    return { filter: "specific", date: params.date };
  }

  // Compatibility for links created before the named filters were introduced.
  if (!params.filter && params.date === "all") return { filter: "all" };
  if (!params.filter && isValidDateKey(params.date)) {
    return { filter: "specific", date: params.date };
  }

  return { filter: "upcoming" };
}

export function filterScheduleSlots<T extends ScheduleSlot>(
  slots: T[],
  selection: ScheduleFilterSelection,
  timezone: string,
  now = new Date(),
) {
  if (selection.filter === "all") return slots;
  if (selection.filter === "specific") {
    return slots.filter(
      (slot) => localDateKey(slot.slot_start_at, timezone) === selection.date,
    );
  }

  const currentTime = now.getTime();
  return slots.filter((slot) => {
    const endTime = new Date(slot.slot_end_at).getTime();
    return selection.filter === "upcoming" ? endTime >= currentTime : endTime < currentTime;
  });
}
