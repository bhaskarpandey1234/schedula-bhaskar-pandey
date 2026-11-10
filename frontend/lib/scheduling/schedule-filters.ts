import { localDateKey } from "@/lib/scheduling/time";

export const scheduleFilterOptions = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "specific", label: "Specific date" },
] as const;

export const scheduleTypeFilterOptions = [
  { value: "all", label: "All schedule types" },
  { value: "wave", label: "Wave" },
  { value: "stream", label: "Stream" },
] as const;

export type ScheduleFilter = (typeof scheduleFilterOptions)[number]["value"];
export type ScheduleTypeFilter = (typeof scheduleTypeFilterOptions)[number]["value"];
export type ScheduleFilterSelection = { filter: ScheduleFilter; date?: string; weekday?: number; scheduleType?: ScheduleTypeFilter };

type ScheduleSearchParams = { filter?: string; date?: string; weekday?: string; scheduleType?: string };
type ScheduleSlot = { slot_start_at: string; slot_end_at: string; scheduling_type?: "wave" | "stream" };

function parseScheduleType(value?: string): Exclude<ScheduleTypeFilter, "all"> | undefined {
  return value === "wave" || value === "stream" ? value : undefined;
}

function parseWeekday(value?: string) {
  const weekday = Number(value);
  return Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? weekday : undefined;
}

function localWeekday(value: string, timezone: string) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date(value));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

export function isValidDateKey(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseScheduleFilter(params: ScheduleSearchParams): ScheduleFilterSelection {
  if (params.filter === "all" || params.filter === "upcoming" || params.filter === "past") {
    return { filter: params.filter, weekday: parseWeekday(params.weekday), scheduleType: parseScheduleType(params.scheduleType) };
  }
  if (params.filter === "specific" && isValidDateKey(params.date)) {
    return { filter: "specific", date: params.date, weekday: undefined, scheduleType: parseScheduleType(params.scheduleType) };
  }

  // Compatibility for links created before the named filters were introduced.
  if (!params.filter && params.date === "all") return { filter: "all", scheduleType: parseScheduleType(params.scheduleType) };
  if (!params.filter && isValidDateKey(params.date)) {
    return { filter: "specific", date: params.date, weekday: undefined, scheduleType: parseScheduleType(params.scheduleType) };
  }

  return { filter: "upcoming", scheduleType: parseScheduleType(params.scheduleType) };
}

export function filterScheduleSlots<T extends ScheduleSlot>(
  slots: T[],
  selection: ScheduleFilterSelection,
  timezone: string,
  now = new Date(),
) {
  if (selection.filter === "all") {
    return slots.filter((slot) => {
      if (selection.scheduleType && slot.scheduling_type !== selection.scheduleType) return false;
      if (selection.weekday) {
        if (localWeekday(slot.slot_start_at, timezone) !== selection.weekday % 7) return false;
      }
      return true;
    });
  }
  if (selection.filter === "specific") {
    return slots.filter(
      (slot) => (!selection.scheduleType || slot.scheduling_type === selection.scheduleType) && localDateKey(slot.slot_start_at, timezone) === selection.date,
    );
  }

  const currentTime = now.getTime();
  return slots.filter((slot) => {
    if (selection.weekday && localWeekday(slot.slot_start_at, timezone) !== selection.weekday % 7) return false;
    if (selection.scheduleType && slot.scheduling_type !== selection.scheduleType) return false;
    const endTime = new Date(slot.slot_end_at).getTime();
    return selection.filter === "upcoming" ? endTime >= currentTime : endTime < currentTime;
  });
}
