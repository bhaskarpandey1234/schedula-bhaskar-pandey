import { Phase3LoginForm } from "@/components/phase3-login-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { connection } from "next/server";
import { safeReturnPath } from "@/lib/auth/return-path";

export const instant = false;

export default async function Page({ searchParams }: { searchParams?: Promise<{ verified?: string; next?: string }> }) {
  await connection();
  const params = await searchParams;
  return <AuthShell><Phase3LoginForm verified={params?.verified === "1"} next={safeReturnPath(params?.next)} /></AuthShell>;
}
