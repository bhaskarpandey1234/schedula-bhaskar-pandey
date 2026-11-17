import { describe, expect, it } from "vitest";
import { normalizeCheckinToken, resolveCheckinToken } from "../lib/notifications/checkin-token";

describe("check-in email token resolution", () => {
  it("prefers the token captured in the check-in notification", () => {
    expect(resolveCheckinToken("T007", "T008")).toBe("T007");
  });

  it("falls back to the durable queue entry token", () => {
    expect(resolveCheckinToken(null, "T1000")).toBe("T1000");
  });

  it("rejects missing or malformed tokens so the dispatcher can fail safely", () => {
    expect(resolveCheckinToken(null, null)).toBeNull();
    expect(normalizeCheckinToken("appointment confirmed")).toBeNull();
    expect(normalizeCheckinToken("7")).toBeNull();
  });
});
