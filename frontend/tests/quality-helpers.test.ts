import { describe, expect, it } from "vitest";
import { destinationForRole, portalDestinationFor } from "../lib/auth/portal-destination";
import { safeReturnPath } from "../lib/auth/return-path";
import { authErrorMessage } from "../lib/auth/errors";
import { parseDirectoryFilters } from "../lib/discovery/filters";
import { intervalsOverlap, generateSlots } from "../lib/availability/slots";
import { formatLocalTime, localDateKey } from "../lib/scheduling/time";

describe("portal destination rules", () => {
  it("routes unauthenticated and incomplete accounts safely", () => {
    expect(portalDestinationFor(null)).toBe("/auth/login");
    expect(portalDestinationFor({ profile: null, onboardingComplete: false })).toBe("/onboarding");
    expect(portalDestinationFor({ profile: { role: "doctor" }, onboardingComplete: false })).toBe("/onboarding");
  });

  it("routes complete roles to their own portals", () => {
    expect(portalDestinationFor({ profile: { role: "patient" }, onboardingComplete: true })).toBe("/patient");
    expect(portalDestinationFor({ profile: { role: "doctor" }, onboardingComplete: true })).toBe("/doctor");
    expect(destinationForRole("patient")).toBe("/patient");
    expect(destinationForRole("doctor")).toBe("/doctor");
  });
});

describe("booking return paths", () => {
  it("accepts only internal booking paths", () => {
    expect(safeReturnPath("/patient/doctors/8c927186-4b21-4d3e-8771-85553115c820/book/a2a5fa8d-0b70-443a-afbf-71ed8aeb9cbb")).toContain("/patient/doctors/");
    expect(safeReturnPath("https://example.com")).toBeUndefined();
    expect(safeReturnPath("/doctors")).toBeUndefined();
  });
});

describe("public discovery and authentication helpers", () => {
  it("normalizes directory filters without accepting unbounded input", () => {
    expect(parseDirectoryFilters({ q: "  Asha Rao  ", specialty: " Cardiology " })).toEqual({ search: "Asha Rao", specialty: "Cardiology" });
    expect(parseDirectoryFilters({ q: "x".repeat(101) }).search).toHaveLength(100);
  });

  it("maps authentication provider errors to safe messages", () => {
    expect(authErrorMessage({ code: "email_not_confirmed" }).code).toBe("email_not_confirmed");
    expect(authErrorMessage({ message: "Invalid login credentials" }).code).toBe("invalid_credentials");
    expect(authErrorMessage({ message: "untrusted provider response" }).message).not.toContain("provider");
  });
});

describe("scheduling boundaries", () => {
  it("does not create a partial trailing slot", () => {
    const slots = generateSlots(new Date("2099-04-20T09:00:00Z"), new Date("2099-04-20T10:20:00Z"), 30, 2);
    expect(slots).toHaveLength(2);
    expect(slots.at(-1)?.end.toISOString()).toBe("2099-04-20T10:00:00.000Z");
  });

  it("treats adjacent sessions as non-overlapping", () => {
    const start = new Date("2099-04-20T09:00:00Z");
    const end = new Date("2099-04-20T10:00:00Z");
    expect(intervalsOverlap(start, end, end, new Date("2099-04-20T11:00:00Z"))).toBe(false);
    expect(intervalsOverlap(start, end, new Date("2099-04-20T09:30:00Z"), new Date("2099-04-20T10:30:00Z"))).toBe(true);
  });
});

describe("timezone formatting", () => {
  it("uses the requested IANA timezone across a date boundary", () => {
    const instant = "2099-04-20T23:30:00.000Z";
    expect(localDateKey(instant, "Asia/Kolkata")).toBe("2099-04-21");
    expect(localDateKey(instant, "America/Los_Angeles")).toBe("2099-04-20");
    expect(formatLocalTime(instant, "Asia/Kolkata")).toMatch(/5:00\s*AM/);
  });
});
