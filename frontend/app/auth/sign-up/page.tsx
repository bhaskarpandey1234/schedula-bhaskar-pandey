import { Phase3SignUpForm } from "@/components/phase3-sign-up-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { safeReturnPath } from "@/lib/auth/return-path";

export const instant = false;

export default async function Page({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const next = safeReturnPath((await searchParams)?.next);
  return <AuthShell><Phase3SignUpForm next={next} /></AuthShell>;
}
