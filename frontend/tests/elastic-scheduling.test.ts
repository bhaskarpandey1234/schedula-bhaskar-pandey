import { describe, expect, it } from "vitest";
import { availableElasticCandidateDates, availableElasticCandidates, elasticCandidatesForDate, partitionStreamAppointments, reducedStreamCapacity, suggestElasticAssignments, validateElasticWindow, type ElasticPreview } from "../lib/availability/elastic";

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
  it("calculates Stream capacity from minimum patient minutes", () => {
    expect(reducedStreamCapacity(6, "2099-05-01T04:30:00.000Z", "2099-05-01T05:00:00.000Z", 10)).toBe(3);
    expect(reducedStreamCapacity(4, "2099-05-01T04:30:00.000Z", "2099-05-01T05:20:00.000Z", 10)).toBe(4);
    expect(reducedStreamCapacity(4, "2099-05-01T04:30:00.000Z", "2099-05-01T04:39:00.000Z", 10)).toBe(0);
  });

  it("retains earliest confirmed Stream bookings and marks later bookings as overflow", () => {
    const appointments = [
      { appointment_id: "b", source_slot_id: "s", patient_id: "p", start_at: "2099-05-01T04:30:00.000Z", end_at: "2099-05-01T05:30:00.000Z", created_at: "2099-04-02T00:00:00.000Z" },
      { appointment_id: "a", source_slot_id: "s", patient_id: "p", start_at: "2099-05-01T04:30:00.000Z", end_at: "2099-05-01T05:30:00.000Z", created_at: "2099-04-01T00:00:00.000Z" },
      { appointment_id: "c", source_slot_id: "s", patient_id: "p", start_at: "2099-05-01T04:30:00.000Z", end_at: "2099-05-01T05:30:00.000Z", created_at: "2099-04-03T00:00:00.000Z" },
    ];
    const result = partitionStreamAppointments(appointments, 2);
    expect(result.retained.map((item) => item.appointment_id)).toEqual(["a", "b"]);
    expect(result.overflow.map((item) => item.appointment_id)).toEqual(["c"]);
  });

  it("suggests the earliest available destination for each Stream overflow booking", () => {
    const preview: ElasticPreview = { ...base, scheduling_type: "stream", stream_overflow_appointments: [{ appointment_id: "overflow", source_slot_id: "stream", patient_id: "patient", start_at: base.old_start_at, end_at: base.old_end_at }], candidates: [{ slot_id: "later", start_at: "2099-05-01T07:00:00.000Z", end_at: "2099-05-01T08:00:00.000Z", remaining_capacity: 1 }] };
    expect(suggestElasticAssignments(preview)).toEqual([{ appointment_id: "overflow", source_slot_id: "stream", target_slot_id: "later", action: "moved" }]);
  });
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

  it("removes capacity already chosen by another affected booking", () => {
    const preview = {
      ...base,
      candidates: [
        { slot_id: "limited", start_at: "2099-05-02T06:00:00.000Z", end_at: "2099-05-02T06:30:00.000Z", remaining_capacity: 1 },
        { slot_id: "later", start_at: "2099-05-03T06:00:00.000Z", end_at: "2099-05-03T06:30:00.000Z", remaining_capacity: 1 },
      ],
    };
    const candidates = availableElasticCandidates(preview, [
      { appointment_id: "first", source_slot_id: "source-a", target_slot_id: "limited", action: "moved" },
      { appointment_id: "second", source_slot_id: "source-b", target_slot_id: null, action: "cancelled" },
    ], "second");
    expect(candidates.map((candidate) => candidate.slot_id)).toEqual(["later"]);
  });

  it("groups eligible candidates by their doctor-local calendar date", () => {
    const candidates = [
      { slot_id: "night", start_at: "2099-05-01T18:30:00.000Z", end_at: "2099-05-01T19:00:00.000Z", remaining_capacity: 1 },
      { slot_id: "morning", start_at: "2099-05-02T04:30:00.000Z", end_at: "2099-05-02T05:00:00.000Z", remaining_capacity: 1 },
    ];
    expect(availableElasticCandidateDates(candidates, "Asia/Kolkata")).toEqual(["2099-05-02"]);
    expect(elasticCandidatesForDate(candidates, "2099-05-02", "Asia/Kolkata").map((candidate) => candidate.slot_id)).toEqual(["night", "morning"]);
  });

  it("keeps every Stream allocation on the resized shared window", () => {
    const result = suggestElasticAssignments({ ...base, scheduling_type: "stream", appointments: [{ appointment_id: "a", source_slot_id: "stream", patient_id: "p", start_at: base.old_start_at, end_at: base.old_end_at }] });
    expect(result).toEqual([{ appointment_id: "a", source_slot_id: "stream", target_slot_id: "stream", action: "moved" }]);
  });
});
