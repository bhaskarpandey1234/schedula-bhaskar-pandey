"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  scheduleFilterOptions,
  scheduleTypeFilterOptions,
  type ScheduleFilter,
  type ScheduleTypeFilter,
} from "@/lib/scheduling/schedule-filters";

export function ScheduleFilterForm({
  initialFilter,
  initialDate,
  initialWeekday,
  initialScheduleType = "all",
}: {
  initialFilter: ScheduleFilter;
  initialDate: string;
  initialWeekday?: number;
  initialScheduleType?: ScheduleTypeFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<ScheduleFilter>(initialFilter);
  const [date, setDate] = useState(initialDate);
  const [weekday, setWeekday] = useState(initialWeekday ? String(initialWeekday) : "");
  const [scheduleType, setScheduleType] = useState<ScheduleTypeFilter>(initialScheduleType);
  const [open, setOpen] = useState(initialFilter !== "upcoming" || Boolean(initialWeekday) || initialScheduleType !== "all");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setFilter(initialFilter);
    setDate(initialDate);
    setWeekday(initialWeekday ? String(initialWeekday) : "");
    setScheduleType(initialScheduleType);
    setOpen(initialFilter !== "upcoming" || Boolean(initialWeekday) || initialScheduleType !== "all");
  }, [initialDate, initialFilter, initialWeekday, initialScheduleType]);

  function navigate(nextFilter: ScheduleFilter, nextDate?: string, nextWeekday?: string, nextScheduleType = scheduleType) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("created");
    params.set("filter", nextFilter);
    if (nextFilter === "specific" && nextDate) params.set("date", nextDate);
    else params.delete("date");
    if (nextFilter !== "specific" && nextWeekday) params.set("weekday", nextWeekday);
    else params.delete("weekday");
    if (nextScheduleType !== "all") params.set("scheduleType", nextScheduleType);
    else params.delete("scheduleType");
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function applyFilters() {
    navigate(filter, filter === "specific" ? date : undefined, filter === "specific" ? undefined : weekday, scheduleType);
  }

  function clearFilters() {
    setFilter("upcoming");
    setDate(initialDate);
    setWeekday("");
    setScheduleType("all");
    navigate("upcoming", undefined, undefined, "all");
  }

  return <div className="grid gap-3">
    <Button type="button" variant="outline" className="w-full sm:w-auto" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {open ? "Hide filters" : "Filters"}
    </Button>
    {open && <div className="grid gap-4 rounded-2xl border border-border/80 bg-surface-muted/30 p-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_minmax(0,18rem)_auto] sm:items-end">
      <div className="grid min-w-0 gap-2"><Label htmlFor="schedule-filter">Show</Label><CustomSelect id="schedule-filter" name="filter" value={filter} onValueChange={(value) => { const next = value as ScheduleFilter; setFilter(next); if (next !== "specific") setDate(initialDate); }} options={[...scheduleFilterOptions]} required /></div>
      <div className="grid min-w-0 gap-2"><Label htmlFor="schedule-type-filter">Schedule type</Label><CustomSelect id="schedule-type-filter" name="scheduleType" value={scheduleType} onValueChange={(value) => setScheduleType(value as ScheduleTypeFilter)} options={[...scheduleTypeFilterOptions]} /></div>
      {filter === "specific" ? <div className="grid min-w-0 gap-2"><Label htmlFor="schedule-filter-date">Date</Label><Calendar name="date" value={date} onChange={(value) => { setDate(value); navigate("specific", value); }} minDate={initialDate} required /></div> : <div className="grid min-w-0 gap-2"><Label htmlFor="schedule-weekday">Weekday</Label><CustomSelect id="schedule-weekday" name="weekday" value={weekday} onValueChange={setWeekday} options={[{ value: "", label: "Any weekday" }, ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => ({ value: String(index + 1), label }))]} /></div>}
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={applyFilters} disabled={pending}>{pending ? "Updating…" : "Apply filters"}</Button><Button type="button" variant="ghost" onClick={clearFilters} disabled={pending}>Clear</Button></div>
    </div>}
  </div>;
}
