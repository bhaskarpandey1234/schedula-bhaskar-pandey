import { describe, expect, it } from "vitest";
import { presentPaymentError } from "@/lib/payments/errors";

describe("presentPaymentError", () => {
  it("hides production React server-render errors", () => {
    expect(presentPaymentError(new Error("Minified React error #441; digest 123"))).toContain("Check Payments");
    expect(presentPaymentError(new Error("An error occurred in the Server Components render"))).toContain("Check Payments");
  });

  it("keeps actionable payment messages concise", () => {
    expect(presentPaymentError(new Error("Payment signature could not be verified"))).toBe("Payment verification failed. Check Payments before retrying.");
    expect(presentPaymentError(new Error("Payment is not captured yet"))).toContain("not been captured");
  });
});
