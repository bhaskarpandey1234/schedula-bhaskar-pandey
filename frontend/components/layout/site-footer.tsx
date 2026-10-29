import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface">
      <PageContainer className="flex flex-col gap-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Schedula</p>
        <div className="flex gap-5">
          <Link href="/doctors" className="hover:text-foreground">Find doctors</Link>
          <Link href="/auth/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </PageContainer>
    </footer>
  );
}
