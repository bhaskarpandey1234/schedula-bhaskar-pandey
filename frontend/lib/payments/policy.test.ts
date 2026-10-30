import { describe, expect, it } from "vitest";
import { refundAmountMinor, refundPercent } from "./policy";

const now = new Date("2030-01-01T00:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

describe("cancellation refund policy", () => {
  it("returns full refund at the 24-hour boundary", () => expect(refundPercent(at(24), now)).toBe(100));
  it("returns half refund at the 2-hour boundary", () => expect(refundAmountMinor(10000, 0, at(2), now)).toBe(5000));
  it("returns no refund inside two hours and never refunds twice", () => expect(refundAmountMinor(10000, 5000, at(1), now)).toBe(0));
});
