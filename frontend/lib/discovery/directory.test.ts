import { describe, expect, it } from "vitest";
import { formatDateLabel, groupSlotsByDate, parseDirectoryFilters } from "./directory";

describe("doctor discovery helpers", () => {
  it("normalizes and bounds directory filters", () => {
    expect(parseDirectoryFilters({ q: "  Dr. Rao  ", specialty: " Cardiology " })).toEqual({ search: "Dr. Rao", specialty: "Cardiology" });
    expect(parseDirectoryFilters({ q: "x".repeat(120) }).search).toHaveLength(100);
  });

  it("groups slots by the doctor's local date", () => {
    const slots = [
      { slot_id: "1", slot_start_at: "2099-04-20T23:30:00.000Z", slot_end_at: "2099-04-21T00:00:00.000Z", timezone: "Asia/Kolkata", capacity: 3, remaining_capacity: 3 },
      { slot_id: "2", slot_start_at: "2099-04-21T00:30:00.000Z", slot_end_at: "2099-04-21T01:00:00.000Z", timezone: "Asia/Kolkata", capacity: 3, remaining_capacity: 3 },
    ];
    const groups = groupSlotsByDate(slots, "Asia/Kolkata");
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe("2099-04-21");
    expect(formatDateLabel(groups[0].date)).toContain("April");
  });
});
