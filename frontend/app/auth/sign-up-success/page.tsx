import { redirect } from "next/navigation";

export default function LegacySignUpSuccessPage() {
  redirect("/auth/login");
}
