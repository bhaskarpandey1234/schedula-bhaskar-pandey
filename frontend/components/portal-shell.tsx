import { PageContainer } from "@/components/layout/page-container";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import type { Role } from "@/lib/validation/auth";

export function PortalShell({ children, role, name }: { children: React.ReactNode; role?: Role; name?: string }) {
  const accent = role === "patient" ? "[--primary:210_80%_45%] [--ring:210_80%_45%]" : role === "doctor" ? "[--primary:174_72%_31%] [--ring:174_72%_31%]" : "";
  if (!role) {
    return (
      <div className={`min-h-svh flex flex-col justify-between bg-background ${accent}`}>
        <div>
          <SiteHeader role={role} name={name} />
          <main>
            <PageContainer className="py-6 sm:py-8">{children}</PageContainer>
          </main>
        </div>
        <SiteFooter />
      </div>
    );
  }
  return <div className={`min-h-svh bg-background ${accent}`}><SiteHeader role={role} name={name} /><div className="flex min-h-[calc(100svh-4rem)]"><DashboardSidebar role={role} /><main className="min-w-0 flex-1"><PageContainer className="py-6 sm:py-8">{children}</PageContainer></main></div></div>;
}
