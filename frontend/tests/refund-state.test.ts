import { describe, expect, it } from "vitest";
import { isRetryableRefundError, nextRefundState, safeRefundFailureReason } from "@/lib/payments/refund-state";

describe("refund state", () => {
  it("never regresses a processed refund from a late failure", () => {
    expect(nextRefundState("processed", "failed")).toBe("processed");
    expect(nextRefundState("pending", "processed")).toBe("processed");
  });

  it("only retries transient provider failures", () => {
    expect(isRetryableRefundError()).toBe(true);
    expect(isRetryableRefundError(429)).toBe(true);
    expect(isRetryableRefundError(500)).toBe(true);
    expect(isRetryableRefundError(401)).toBe(false);
    expect(safeRefundFailureReason(401)).not.toContain("secret");
  });
});
