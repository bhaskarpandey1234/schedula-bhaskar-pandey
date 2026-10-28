import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next");
  const next = requestedNext === "/onboarding" || requestedNext === "/auth/update-password" ? requestedNext : "/onboarding";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(`/auth/login?verified=1`);
    redirect("/auth/error?reason=verification_failed");
  }

  if (token_hash && type) {

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      redirect(next === "/onboarding" ? "/auth/login?verified=1" : next);
    } else {
      redirect("/auth/error?reason=verification_failed");
    }
  }

  redirect("/auth/error?reason=incomplete_link");
}
