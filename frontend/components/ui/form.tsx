import * as React from "react";
import { cn } from "@/lib/utils";
export const Form = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(({ className, ...props }, ref) => <form ref={ref} className={cn("space-y-5", className)} {...props} />); Form.displayName = "Form";
export function FormField({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) { return <div className="grid gap-2"><label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>; }
