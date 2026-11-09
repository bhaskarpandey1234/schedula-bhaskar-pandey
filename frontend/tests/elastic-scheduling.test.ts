import { describe, expect, it } from "vitest";
import { suggestElasticAssignments, validateElasticWindow, type ElasticPreview } from "../lib/availability/elastic";

const base: ElasticPreview = {
  session_id: "session",
  occurrence_date: "2099-05-01",
  timezone: "Asia/Kolkata",
  scheduling_type: "wave",
  kind: "custom",
  interval_minutes: 30,
  classification: "shrink",
  old_start_at: "2099-05-01T04:30:00.000Z",
  old_end_at: "2099-05-01T06:30:00.000Z",
  new_start_at: "2099-05-01T04:30:00.000Z",
  new_end_at: "2099-05-01T05:30:00.000Z",
  affected_slots: [],
  appointments: [],
  candidates: [],
};

describe("elastic scheduling suggestions", () => {
  it("validates a pure expansion", () => {
    expect(validateElasticWindow({ mode: "expansion", oldStart: "10:00", oldEnd: "12:00", newStart: "09:00", newEnd: "12:00" })).toBeNull();
  });

  it("validates a pure shrink", () => {
    expect(validateElasticWindow({ mode: "shrink", oldStart: "10:00", oldEnd: "12:00", newStart: "10:00", newEnd: "11:00" })).toBeNull();
  });

  it("rejects unchanged and mixed-direction windows", () => {
    expect(validateElasticWindow({ mode: "expansion", oldStart: "10:00", oldEnd: "12:00", newStart: "10:00", newEnd: "12:00" })).toMatch(/at least one boundary/i);
    expect(validateElasticWindow({ mode: "shrink", oldStart: "10:00", oldEnd: "12:00", newStart: "09:00", newEnd: "11:00" })).toMatch(/stay inside/i);
  });

  it("packs appointments into the earliest compatible capacity", () => {
    const result = suggestElasticAssignments({
      ...base,
      appointments: [
        { appointment_id: "a", source_slot_id: "old-a", patient_id: "p-a", start_at: "2099-05-01T06:00:00.000Z", end_at: "2099-05-01T06:30:00.000Z" },
        { appointment_id: "b", source_slot_id: "old-b", patient_id: "p-b", start_at: "2099-05-01T06:00:00.000Z", end_at: "2099-05-01T06:30:00.000Z" },
      ],
      candidates: [
        { slot_id: "future-late", start_at: "2099-05-02T06:00:00.000Z", end_at: "2099-05-02T06:30:00.000Z", remaining_capacity: 2 },
      ],
    });
    expect(result.map((item) => item.target_slot_id)).toEqual(["future-late", "future-late"]);
  });

  it("marks appointments without capacity for explicit cancellation", () => {
    const result = suggestElasticAssignments({ ...base, appointments: [{ appointment_id: "a", source_slot_id: "old", patient_id: "p", start_at: "2099-05-01T06:00:00.000Z", end_at: "2099-05-01T06:30:00.000Z" }] });
    expect(result).toEqual([{ appointment_id: "a", source_slot_id: "old", target_slot_id: null, action: "cancelled" }]);
  });

  it("keeps every Stream allocation on the resized shared window", () => {
    const result = suggestElasticAssignments({ ...base, scheduling_type: "stream", appointments: [{ appointment_id: "a", source_slot_id: "stream", patient_id: "p", start_at: base.old_start_at, end_at: base.old_end_at }] });
    expect(result).toEqual([{ appointment_id: "a", source_slot_id: "stream", target_slot_id: "stream", action: "moved" }]);
  });
});
