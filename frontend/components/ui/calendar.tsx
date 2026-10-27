import { cn } from "@/lib/utils";
export function Calendar({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <input type="date" className={cn("h-10 rounded-md border border-input bg-surface px-3 text-sm", className)} {...props} />; }
