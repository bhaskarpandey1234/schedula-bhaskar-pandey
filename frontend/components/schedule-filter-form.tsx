"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  scheduleFilterOptions,
  type ScheduleFilter,
} from "@/lib/scheduling/schedule-filters";

export function ScheduleFilterForm({
  initialFilter,
  initialDate,
}: {
  initialFilter: ScheduleFilter;
  initialDate: string;
}) {
  const [filter, setFilter] = useState<ScheduleFilter>(initialFilter);
  const [date, setDate] = useState(initialDate);
  const [weekday, setWeekday] = useState("");

  return (
    <form className="grid gap-2" method="get">
      <Label htmlFor="schedule-filter">Filters</Label>
      <div className="flex flex-wrap items-end gap-2">
        <CustomSelect
          id="schedule-filter"
          name="filter"
          value={filter}
          onValueChange={(value) => setFilter(value as ScheduleFilter)}
          options={[...scheduleFilterOptions]}
          className="min-w-44"
          required
        />
        {filter === "specific" && <Calendar name="date" value={date} onChange={setDate} minDate={initialDate} required />}
        {filter !== "specific" && <CustomSelect id="schedule-weekday" name="weekday" value={weekday} onValueChange={setWeekday} options={[{ value: "", label: "Any weekday" }, ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => ({ value: String(index + 1), label }))]} />}
        <Button type="submit" size="lg">
          View
        </Button>
      </div>
    </form>
  );
}
