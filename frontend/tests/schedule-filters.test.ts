import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleFilterForm } from "../components/schedule-filter-form";
import {
  filterScheduleSlots,
  parseScheduleFilter,
} from "../lib/scheduling/schedule-filters";

const slots = [
  { id: "past", slot_start_at: "2026-10-29T08:00:00.000Z", slot_end_at: "2026-10-29T08:30:00.000Z" },
  { id: "boundary", slot_start_at: "2026-10-30T09:30:00.000Z", slot_end_at: "2026-10-30T10:00:00.000Z" },
  { id: "future", slot_start_at: "2026-10-30T20:00:00.000Z", slot_end_at: "2026-10-30T20:30:00.000Z" },
];

describe("doctor schedule filters", () => {
  it("parses named filters and defaults invalid input to upcoming", () => {
    expect(parseScheduleFilter({ filter: "all" })).toEqual({ filter: "all" });
    expect(parseScheduleFilter({ filter: "past" })).toEqual({ filter: "past" });
    expect(parseScheduleFilter({ filter: "specific", date: "2026-10-30" })).toEqual({
      filter: "specific",
      date: "2026-10-30",
    });
    expect(parseScheduleFilter({ filter: "specific", date: "2026-02-30" })).toEqual({
      filter: "upcoming",
    });
    expect(parseScheduleFilter({ filter: "unknown" })).toEqual({ filter: "upcoming" });
  });

  it("supports legacy all and date URLs", () => {
    expect(parseScheduleFilter({ date: "all" })).toEqual({ filter: "all" });
    expect(parseScheduleFilter({ date: "2026-10-30" })).toEqual({
      filter: "specific",
      date: "2026-10-30",
    });
  });

  it("partitions slots at the end-time boundary", () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    expect(filterScheduleSlots(slots, { filter: "upcoming" }, "UTC", now).map((slot) => slot.id))
      .toEqual(["boundary", "future"]);
    expect(filterScheduleSlots(slots, { filter: "past" }, "UTC", now).map((slot) => slot.id))
      .toEqual(["past"]);
    expect(filterScheduleSlots(slots, { filter: "all" }, "UTC", now)).toEqual(slots);
  });

  it("matches a specific date in the doctor's timezone", () => {
    expect(
      filterScheduleSlots(slots, { filter: "specific", date: "2026-10-31" }, "Asia/Kolkata")
        .map((slot) => slot.id),
    ).toEqual(["future"]);
  });

  it("shows the date field only for the specific-date filter", () => {
    const specific = renderToStaticMarkup(
      React.createElement(ScheduleFilterForm, {
        initialFilter: "specific",
        initialDate: "2026-10-30",
      }),
    );
    const upcoming = renderToStaticMarkup(
      React.createElement(ScheduleFilterForm, {
        initialFilter: "upcoming",
        initialDate: "2026-10-30",
      }),
    );
    expect(specific).toContain('type="date"');
    expect(specific).toContain('value="2026-10-30"');
    expect(upcoming).not.toContain('type="date"');
  });
});
