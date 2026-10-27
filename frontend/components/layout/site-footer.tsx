import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface">
      <PageContainer className="flex flex-col gap-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Schedula Healthcare</p>
        <div className="flex gap-5">
          <Link href="#how-it-works" className="hover:text-foreground">How it works</Link>
          <Link href="/auth/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </PageContainer>
    </footer>
  );
}
