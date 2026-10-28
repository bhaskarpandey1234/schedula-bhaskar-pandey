import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";

export const instant = false;

export default async function PatientPage() {
  await requireRole("patient");
  redirect("/doctors");
}
