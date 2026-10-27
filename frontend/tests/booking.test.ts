import { describe, expect, it } from "vitest";
import { bookingSchema } from "../lib/validation/booking";

describe("appointment booking validation", () => {
  it("accepts an optional trimmed visit reason", () => {
    const result = bookingSchema.parse({ slotId: "00000000-0000-4000-8000-000000000001", reason: "  Follow-up visit  " });
    expect(result.reason).toBe("Follow-up visit");
  });

  it("rejects invalid slots and reasons longer than 500 characters", () => {
    expect(bookingSchema.safeParse({ slotId: "not-a-uuid" }).success).toBe(false);
    expect(bookingSchema.safeParse({ slotId: "00000000-0000-4000-8000-000000000001", reason: "x".repeat(501) }).success).toBe(false);
  });

  it("allows an omitted reason", () => {
    expect(bookingSchema.parse({ slotId: "00000000-0000-4000-8000-000000000001" }).reason).toBeUndefined();
  });
});
