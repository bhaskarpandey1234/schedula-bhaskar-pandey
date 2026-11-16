import { describe, expect, it } from "vitest";
import { isExistingAuthUserError, resendPendingStaffInvitation } from "../lib/auth/staff-invitations";

describe("staff invitation email recovery", () => {
  it.each([
    { code: "email_exists", message: "User already registered" },
    { code: "user_already_exists", message: "Email already exists" },
    { message: "User has already been registered" },
  ])("recognizes existing-account response %#", (error) => {
    expect(isExistingAuthUserError(error)).toBe(true);
  });

  it("does not mistake other invitation failures for a duplicate account", () => {
    expect(isExistingAuthUserError({ code: "over_email_send_rate_limit", message: "Too many requests" })).toBe(false);
  });

  it("uses Supabase's signup-confirmation path and preserves the password-setup redirect", async () => {
    let request: unknown;
    const sent = await resendPendingStaffInvitation({
      auth: {
        resend: async (input) => {
          request = input;
          return { error: null };
        },
      },
    }, "staff@example.test", "https://preview.example.test/auth/confirm?next=/auth/update-password");

    expect(sent).toBe(true);
    expect(request).toEqual({
      type: "signup",
      email: "staff@example.test",
      options: { emailRedirectTo: "https://preview.example.test/auth/confirm?next=/auth/update-password" },
    });
  });

  it("does not report a resend as successful when Supabase rejects it", async () => {
    await expect(resendPendingStaffInvitation({
      auth: { resend: async () => ({ error: new Error("rate limited") }) },
    }, "staff@example.test", "https://preview.example.test/auth/confirm?next=/auth/update-password")).resolves.toBe(false);
  });
});
