import { Phase3LoginForm } from "@/components/phase3-login-form";
import { AuthShell } from "@/components/layout/auth-shell";

export default function Page() {
  return <AuthShell><Phase3LoginForm /></AuthShell>;
}
