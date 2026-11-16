import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { PortalShell } from "@/components/portal-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const account = await requireRole("admin");
  return <PortalShell role="admin" name={account.profile.full_name}>{children}</PortalShell>;
}
