import { cn } from "@/lib/utils";
export function Toast({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div role="status" className={cn("rounded-lg border bg-surface p-4 shadow-lg", className)} {...props} />; }
export const ToastTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn("font-semibold", className)} {...props} />;
export const ToastDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
