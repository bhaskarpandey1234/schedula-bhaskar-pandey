import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, className }: { title: string; description: string; action?: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed bg-surface px-6 py-12 text-center", className)}>
    <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox aria-hidden="true" className="size-5" /></span>
    <h3 className="font-semibold">{title}</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-5">{action}</div> : null}
  </div>;
}
