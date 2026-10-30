"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
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

  return (
    <form className="grid gap-2" method="get">
      <Label htmlFor="schedule-filter">Show slots</Label>
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
        {filter === "specific" && (
          <div className="grid gap-2">
            <Label htmlFor="schedule-date" className="sr-only">
              Specific date
            </Label>
            <Input
              id="schedule-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 w-auto"
              required
            />
          </div>
        )}
        <Button type="submit" size="lg">
          View
        </Button>
      </div>
    </form>
  );
}
