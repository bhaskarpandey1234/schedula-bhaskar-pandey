import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/guards";
import { connection } from "next/server";

export default async function DoctorPortalLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const account = await requireRole("doctor");
  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      {children}
    </PortalShell>
  );
}
