import { describe, expect, it } from "vitest";
import { resendPendingStaffInvitation } from "../lib/auth/staff-invitations";

describe("staff invitation email recovery", () => {
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
