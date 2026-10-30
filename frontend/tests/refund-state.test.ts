import { describe, expect, it } from "vitest";
import { findMatchingProviderRefund, isRetryableRefundError, nextRefundState, normalizeProviderRefundState, safeRefundFailureReason } from "@/lib/payments/refund-state";

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

  it("normalizes Razorpay refund states", () => {
    expect(normalizeProviderRefundState("processed")).toBe("processed");
    expect(normalizeProviderRefundState("pending")).toBe("pending");
    expect(normalizeProviderRefundState("created")).toBe("pending");
    expect(normalizeProviderRefundState("failed")).toBe("failed");
  });

  it("matches only the exact payment, amount, and an unlinked provider refund", () => {
    const linked = new Set(["rfnd-linked"]);
    expect(findMatchingProviderRefund([
      { id: "rfnd-other", paymentId: "pay-1", amount: 50000, status: "processed" },
      { id: "rfnd-linked", paymentId: "pay-1", amount: 50000, status: "processed" },
      { id: "rfnd-match", paymentId: "pay-1", amount: 50000, status: "processed" },
    ], "pay-1", 50000, linked)?.id).toBe("rfnd-other");
    expect(findMatchingProviderRefund([{ id: "rfnd-wrong", paymentId: "pay-2", amount: 50000, status: "processed" }], "pay-1", 50000, new Set())).toBeUndefined();
  });
});
