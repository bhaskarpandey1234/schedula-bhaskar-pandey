"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
export function Tabs({ defaultValue, children, className }: { defaultValue?: string; children: React.ReactNode; className?: string }) { return <div className={cn("w-full", className)} data-default-value={defaultValue}>{children}</div>; }
export const TabsList = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div role="tablist" className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1", className)} {...props} />;
export const TabsTrigger = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" role="tab" className={cn("rounded-sm px-3 py-1.5 text-sm font-medium transition-colors hover:bg-background", className)} {...props} />;
export const TabsContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div role="tabpanel" className={cn("mt-2", className)} {...props} />;
