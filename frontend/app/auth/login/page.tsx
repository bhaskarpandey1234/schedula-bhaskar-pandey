import { Phase3LoginForm } from "@/components/phase3-login-form";
import { AuthShell } from "@/components/layout/auth-shell";

export default async function Page({ searchParams }: { searchParams?: Promise<{ verified?: string }> }) {
  const params = await searchParams;
  return <AuthShell><Phase3LoginForm verified={params?.verified === "1"} /></AuthShell>;
}
