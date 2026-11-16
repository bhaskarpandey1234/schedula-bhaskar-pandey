import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const account = await requireRole("staff");
  return <PortalShell role="staff" name={account.profile.full_name}>{children}</PortalShell>;
}
