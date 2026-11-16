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
