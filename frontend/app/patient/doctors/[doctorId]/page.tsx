import { redirect } from "next/navigation";
import { isUuid } from "@/lib/discovery/directory";

export const instant = false;

export default async function LegacyDoctorDetail({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  if (!isUuid(doctorId)) redirect("/doctors");
  redirect(`/doctors/${doctorId}`);
}
