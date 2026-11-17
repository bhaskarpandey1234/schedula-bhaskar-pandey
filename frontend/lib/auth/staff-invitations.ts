type PendingInvitationAuthClient = {
  auth: {
    resend(input: {
      type: "signup";
      email: string;
      options: { emailRedirectTo: string };
    }): Promise<{ error: unknown }>;
  };
};

// Invited staff are initially unconfirmed users. Supabase's resend endpoint
// sends the same confirmation link flow used for a normal email sign-up.
export async function resendPendingStaffInvitation(
  client: PendingInvitationAuthClient,
  email: string,
  redirectTo: string,
): Promise<boolean> {
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return !error;
}

export function isExistingAuthUserError(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code?.toLowerCase() ?? "";
  const message = error?.message?.toLowerCase() ?? "";
  return code === "email_exists"
    || code === "user_already_exists"
    || code === "email_address_not_authorized"
    || message.includes("already been registered")
    || message.includes("already exists")
    || message.includes("already registered");
}
