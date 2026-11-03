import { describe, expect, it } from "vitest";
import { findMatchingCapturedPayment } from "./reconciliation";

const captured = { id: "pay-1", orderId: "order-1", amount: 100000, currency: "INR", status: "captured" } as const;

describe("findMatchingCapturedPayment", () => {
  it("matches the exact captured order, amount, and currency", () => {
    expect(findMatchingCapturedPayment([captured], { orderId: "order-1", amountMinor: 100000, currency: "INR" })).toEqual(captured);
  });

  it.each([
    { orderId: "order-other", amountMinor: 100000, currency: "INR" },
    { orderId: "order-1", amountMinor: 99900, currency: "INR" },
    { orderId: "order-1", amountMinor: 100000, currency: "USD" },
  ])("rejects a mismatched payment: %o", (input) => {
    expect(findMatchingCapturedPayment([captured], input)).toBeUndefined();
  });

  it("allows an explicitly configured authorized status", () => {
    const authorized = { ...captured, status: "authorized" };
    expect(findMatchingCapturedPayment([authorized], { orderId: "order-1", amountMinor: 100000, currency: "INR", acceptedStatuses: ["authorized"] })).toEqual(authorized);
    expect(findMatchingCapturedPayment([authorized], { orderId: "order-1", amountMinor: 100000, currency: "INR" })).toBeUndefined();
  });
});
