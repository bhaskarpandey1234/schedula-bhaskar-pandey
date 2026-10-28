import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-5 lg:px-6 xl:px-8", className)}>
      {children}
    </div>
  );
}
