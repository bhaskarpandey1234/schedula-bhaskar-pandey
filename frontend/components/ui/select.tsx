import * as React from "react";
import { cn } from "@/lib/utils";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => <select ref={ref} className={cn("flex h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />); Select.displayName = "Select";
export const SelectGroup = "optgroup";
export const SelectValue = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
export const SelectTrigger = Select;
export const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>;
