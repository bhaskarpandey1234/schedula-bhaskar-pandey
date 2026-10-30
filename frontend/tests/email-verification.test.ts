import { describe, expect, it } from "vitest";
import { authErrorCategory, authErrorMessage } from "../lib/auth/errors";
import { getAuthConfirmRedirect } from "../lib/auth/redirects";

describe("email verification flow", () => {
  it("classifies Supabase unverified-login errors", () => {
    expect(authErrorCategory({ code: "email_not_confirmed" })).toBe("email_not_confirmed");
    expect(authErrorMessage({ message: "Email not confirmed" })).toEqual({ code: "email_not_confirmed", message: "Please verify your email before signing in." });
  });

  it("maps resend rate limits without exposing provider details", () => {
    const result = authErrorMessage({ status: 429, message: "too many requests for email" });
    expect(result.code).toBe("rate_limited");
    expect(result.message).toContain("wait");
    expect(result.message).not.toContain("email");
  });

  it("builds the confirmation callback used by signup and resend", () => {
    expect(getAuthConfirmRedirect("/onboarding")).toMatch(/\/auth\/confirm\?next=\/onboarding$/);
  });
});
