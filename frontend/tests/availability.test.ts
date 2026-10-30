import { describe, expect, it } from "vitest";
import { generateSlots } from "../lib/availability/slots";
import { availabilitySessionSchema } from "../lib/validation/availability";
import { doctorProfileSchema } from "../lib/validation/doctor-profile";
import { createAvailabilityAction } from "../lib/availability/actions";

describe("Phase 4 validation", () => {
  it("accepts weekly consulting days without a session date", () => {
    expect(availabilitySessionSchema.safeParse({ mode: "weekly", consultingDays: [1, 3, 5], startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
  });
  it("accepts a future custom date and rejects a weekly date", () => {
    expect(availabilitySessionSchema.safeParse({ mode: "custom", sessionDate: "2099-04-20", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
    expect(availabilitySessionSchema.safeParse({ mode: "weekly", sessionDate: "2099-04-20", consultingDays: [1], startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
  });
  it("accepts supported intervals and capacity defaults", () => {
    expect(availabilitySessionSchema.safeParse({ sessionDate: "2099-04-20", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
  });
  it("rejects invalid intervals, capacity, dates, and time order", () => {
    expect(availabilitySessionSchema.safeParse({ sessionDate: "2000-04-20", startTime: "11:00", endTime: "09:00", timezone: "Asia/Kolkata", intervalMinutes: 20, capacity: 11 }).success).toBe(false);
  });
  it("validates editable doctor profile data", () => {
    expect(doctorProfileSchema.safeParse({ fullName: "Dr. Asha Rao", specialty: "Cardiology", clinicName: "River Clinic", experienceYears: 8, biography: "A board-certified physician focused on preventive care and clear communication.", timezone: "Asia/Kolkata" }).success).toBe(true);
  });
  it("preserves custom mode values after a validation error", async () => {
    const form = new FormData();
    form.set("mode", "custom");
    form.set("sessionDate", "2099-04-20");
    form.set("startTime", "11:00");
    form.set("endTime", "09:00");
    form.set("timezone", "Asia/Kolkata");
    form.set("intervalMinutes", "30");
    form.set("capacity", "3");
    const result = await createAvailabilityAction({}, form);
    expect(result.error).toBe("End time must be after start time.");
    expect(result.fieldErrors?.endTime).toBe("End time must be after start time.");
    expect(result.values).toMatchObject({ mode: "custom", sessionDate: "2099-04-20", startTime: "11:00", endTime: "09:00", intervalMinutes: "30", capacity: "3" });
  });
  it("preserves all selected weekly days after a validation error", async () => {
    const form = new FormData();
    form.set("mode", "weekly");
    form.append("consultingDays", "1");
    form.append("consultingDays", "4");
    form.set("startTime", "11:00");
    form.set("endTime", "09:00");
    form.set("timezone", "Asia/Kolkata");
    form.set("intervalMinutes", "30");
    form.set("capacity", "3");
    const result = await createAvailabilityAction({}, form);
    expect(result.values?.mode).toBe("weekly");
    expect(result.values?.consultingDays).toBe("1,4");
  });
});

describe("slot generation", () => {
  it.each([[15, 4], [30, 2], [60, 1]] as const)("generates %s-minute slots", (interval, count) => {
    const slots = generateSlots(new Date("2099-04-20T09:00:00Z"), new Date("2099-04-20T10:00:00Z"), interval, 3);
    expect(slots).toHaveLength(count);
    expect(slots.every((slot) => slot.capacity === 3)).toBe(true);
    expect(slots.at(-1)?.end.toISOString()).toBe("2099-04-20T10:00:00.000Z");
  });
});
