import { describe, expect, it } from "vitest";
import { createCheckoutPrefill } from "@/lib/payments/checkout";

describe("createCheckoutPrefill", () => {
  it("normalizes authenticated patient details", () => {
    expect(createCheckoutPrefill({ name: "  Aman  ", email: "AMAN@example.com ", contact: "+919876543210" })).toEqual({ name: "Aman", email: "aman@example.com", contact: "+919876543210" });
  });

  it.each([
    { name: null, email: "patient@example.com", contact: "+919876543210" },
    { name: "Patient", email: null, contact: "+919876543210" },
    { name: "Patient", email: "patient@example.com", contact: null },
    { name: "Patient", email: "patient@example.com", contact: "9999999999" },
  ])("rejects incomplete or invalid profile data: %o", (input) => {
    expect(createCheckoutPrefill(input)).toBeNull();
  });
});
