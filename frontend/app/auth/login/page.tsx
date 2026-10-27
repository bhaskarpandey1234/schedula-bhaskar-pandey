import { LoginForm } from "@/components/login-form";
import { AuthShell } from "@/components/layout/auth-shell";

export default function Page() {
  return <AuthShell><LoginForm /></AuthShell>;
}
