import { describe, expect, it } from "vitest";
import { appointmentIdSchema, appointmentTabSchema } from "../lib/validation/appointments";

describe("appointment management validation", () => {
  it("accepts appointment UUIDs and supported tabs", () => {
    expect(appointmentIdSchema.safeParse({ appointmentId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(appointmentTabSchema.parse("upcoming")).toBe("upcoming");
    expect(appointmentTabSchema.parse("past")).toBe("past");
    expect(appointmentTabSchema.parse("cancelled")).toBe("cancelled");
  });

  it("rejects malformed IDs and unknown tabs", () => {
    expect(appointmentIdSchema.safeParse({ appointmentId: "not-a-uuid" }).success).toBe(false);
    expect(appointmentTabSchema.safeParse("all").success).toBe(false);
  });
});
