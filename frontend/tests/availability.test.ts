import { describe, expect, it } from "vitest";
import { generateSlots } from "../lib/availability/slots";
import { availabilitySessionSchema } from "../lib/validation/availability";
import { doctorProfileSchema } from "../lib/validation/doctor-profile";
import { createAvailabilityAction } from "../lib/availability/actions";

describe("Phase 4 validation", () => {
  it("accepts recurring schedules by day without a session date", () => {
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceMethod: "day", consultingDays: [1, 3, 5], recurrenceStartDate: "2099-04-20", recurrenceEndDate: "2100-04-19", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
  });
  it("accepts a future specific date and rejects recurrence fields", () => {
    expect(availabilitySessionSchema.safeParse({ sessionType: "specific_date", sessionDate: "2099-04-20", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
    expect(availabilitySessionSchema.safeParse({ sessionType: "specific_date", recurrenceMethod: "day", sessionDate: "2099-04-20", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
  });
  it("accepts monthly date ranges and enforces the monthly end day", () => {
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceMethod: "date", recurrenceStartDate: "2099-04-10", recurrenceEndDate: "2099-12-31", monthlyRangeEndDay: 20, startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceMethod: "date", recurrenceStartDate: "2099-04-20", recurrenceEndDate: "2099-12-31", monthlyRangeEndDay: 10, startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceMethod: "date", recurrenceStartDate: "2099-04-10", recurrenceEndDate: "2101-04-10", monthlyRangeEndDay: 20, startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
  });
  it("requires one recurrence method and keeps day/date fields exclusive", () => {
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceStartDate: "2099-04-10", recurrenceEndDate: "2099-12-31", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceMethod: "day", consultingDays: [1], recurrenceStartDate: "2099-04-10", recurrenceEndDate: "2099-12-31", monthlyRangeEndDay: 20, startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
    expect(availabilitySessionSchema.safeParse({ sessionType: "recurring", recurrenceMethod: "date", consultingDays: [1], recurrenceStartDate: "2099-04-10", recurrenceEndDate: "2099-12-31", monthlyRangeEndDay: 20, startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
  });
  it("accepts supported intervals and capacity defaults", () => {
    expect(availabilitySessionSchema.safeParse({ sessionDate: "2099-04-20", startTime: "09:00", endTime: "11:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(true);
  });
  it("accepts Stream windows without a duration and rejects a Stream duration", () => {
    expect(availabilitySessionSchema.safeParse({ schedulingType: "stream", sessionDate: "2099-04-20", startTime: "10:00", endTime: "12:00", timezone: "Asia/Kolkata", capacity: 3 }).success).toBe(true);
    expect(availabilitySessionSchema.safeParse({ schedulingType: "stream", sessionDate: "2099-04-20", startTime: "10:00", endTime: "12:00", timezone: "Asia/Kolkata", intervalMinutes: 30, capacity: 3 }).success).toBe(false);
  });
  it("rejects invalid intervals, capacity, dates, and time order", () => {
    expect(availabilitySessionSchema.safeParse({ sessionDate: "2000-04-20", startTime: "11:00", endTime: "09:00", timezone: "Asia/Kolkata", intervalMinutes: 20, capacity: 11 }).success).toBe(false);
  });
  it("validates editable doctor profile data", () => {
    expect(doctorProfileSchema.safeParse({ fullName: "Dr. Asha Rao", countryCode: "+1", phone: "+14155552671", specialty: "Cardiology", clinicName: "River Clinic", experienceYears: 8, biography: "A board-certified physician focused on preventive care and clear communication.", timezone: "Asia/Kolkata", consultationFee: 1000 }).success).toBe(true);
  });
  it("preserves custom mode values after a validation error", async () => {
    const form = new FormData();
    form.set("sessionType", "specific_date");
    form.set("sessionDate", "2099-04-20");
    form.set("startTime", "11:00");
    form.set("endTime", "09:00");
    form.set("timezone", "Asia/Kolkata");
    form.set("intervalMinutes", "30");
    form.set("capacity", "3");
    const result = await createAvailabilityAction({}, form);
    expect(result.error).toBe("End time must be after start time.");
    expect(result.fieldErrors?.endTime).toBe("End time must be after start time.");
    expect(result.values).toMatchObject({ sessionType: "specific_date", sessionDate: "2099-04-20", startTime: "11:00", endTime: "09:00", intervalMinutes: "30", capacity: "3" });
  });
  it("preserves all selected weekly days after a validation error", async () => {
    const form = new FormData();
    form.set("sessionType", "recurring");
    form.set("recurrenceMethod", "day");
    form.append("consultingDays", "1");
    form.append("consultingDays", "4");
    form.set("recurrenceStartDate", "2099-04-20");
    form.set("recurrenceEndDate", "2099-12-31");
    form.set("startTime", "11:00");
    form.set("endTime", "09:00");
    form.set("timezone", "Asia/Kolkata");
    form.set("intervalMinutes", "30");
    form.set("capacity", "3");
    const result = await createAvailabilityAction({}, form);
    expect(result.values?.sessionType).toBe("recurring");
    expect(result.values?.recurrenceMethod).toBe("day");
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
