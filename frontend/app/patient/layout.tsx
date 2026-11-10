import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  const account = await requireRole("patient");
  return (
    <PortalShell role="patient" name={account.profile.full_name}>
      {children}
    </PortalShell>
  );
}
