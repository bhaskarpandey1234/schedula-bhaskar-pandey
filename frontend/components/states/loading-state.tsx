import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div role="status" aria-label={label} className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-20 w-full" /><span className="sr-only">{label}</span></div>;
}
