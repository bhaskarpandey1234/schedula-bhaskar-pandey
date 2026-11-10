import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function DoctorPortalLayout({ children }: { children: React.ReactNode }) {
  const account = await requireRole("doctor");
  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      {children}
    </PortalShell>
  );
}
