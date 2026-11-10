import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleFilterForm } from "../components/schedule-filter-form";
import { Calendar } from "../components/ui/calendar";
import {
  filterScheduleSlots,
  parseScheduleFilter,
} from "../lib/scheduling/schedule-filters";

vi.mock("next/navigation", () => ({
  usePathname: () => "/doctor/schedule",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

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

  it("filters upcoming slots by weekday without changing the date selection", () => {
    expect(parseScheduleFilter({ filter: "upcoming", weekday: "1" })).toEqual({ filter: "upcoming", weekday: 1 });
    expect(filterScheduleSlots(slots, { filter: "all", weekday: 5 }, "UTC", new Date("2026-10-30T00:00:00.000Z")).map((slot) => slot.id)).toEqual(["boundary", "future"]);
  });

  it("matches a specific date in the doctor's timezone", () => {
    expect(
      filterScheduleSlots(slots, { filter: "specific", date: "2026-10-31" }, "Asia/Kolkata")
        .map((slot) => slot.id),
    ).toEqual(["future"]);
  });

  it("filters Wave and Stream slots without relying on the host timezone", () => {
    const typedSlots = [
      { id: "wave", slot_start_at: "2026-10-30T23:30:00.000Z", slot_end_at: "2026-10-31T00:00:00.000Z", scheduling_type: "wave" as const },
      { id: "stream", slot_start_at: "2026-10-31T00:30:00.000Z", slot_end_at: "2026-10-31T01:00:00.000Z", scheduling_type: "stream" as const },
    ];
    expect(parseScheduleFilter({ filter: "specific", date: "2026-10-31", scheduleType: "wave" })).toEqual({ filter: "specific", date: "2026-10-31", scheduleType: "wave" });
    expect(parseScheduleFilter({ filter: "upcoming", scheduleType: "invalid" })).toEqual({ filter: "upcoming" });
    expect(filterScheduleSlots(typedSlots, { filter: "specific", date: "2026-10-31", scheduleType: "wave" }, "Asia/Kolkata").map((slot) => slot.id)).toEqual(["wave"]);
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

  it("keeps disabled calendar dates visible instead of hiding them", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Calendar, {
        value: "2026-11-16",
        minDate: "2026-11-15",
      }),
    );
    expect(markup).toContain('aria-label="2026-11-15"');
    expect(markup).toContain("text-muted-foreground/35");
    expect(markup).not.toMatch(/aria-label="2026-11-15"[^>]*invisible/);
  });
});
