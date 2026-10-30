import { describe, expect, it } from "vitest";
import { formatLocalSlotRange } from "../lib/scheduling/time";

describe("slot range formatting", () => {
  it("renders both times on the same local date", () => {
    expect(formatLocalSlotRange("2099-04-20T03:30:00.000Z", "2099-04-20T04:00:00.000Z", "Asia/Kolkata")).toBe("9:00 AM – 9:30 AM");
  });

  it("includes both local dates when a slot crosses midnight", () => {
    expect(formatLocalSlotRange("2099-04-20T18:00:00.000Z", "2099-04-20T18:30:00.000Z", "Asia/Kolkata")).toBe("Apr 20 11:30 PM – Apr 21 12:00 AM");
  });
});
