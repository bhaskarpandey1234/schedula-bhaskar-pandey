import { redirect } from "next/navigation";

export default async function LegacyDoctorDirectory({ searchParams }: { searchParams?: Promise<{ q?: string; specialty?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.specialty) query.set("specialty", params.specialty);
  redirect(`/doctors${query.size ? `?${query}` : ""}`);
}
