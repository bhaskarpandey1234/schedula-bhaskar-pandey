"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

const DialogContext = React.createContext<{ open: boolean; setOpen: (value: boolean) => void } | null>(null);
function Dialog({ open: controlledOpen, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) { const [internal, setInternal] = React.useState(false); const open = controlledOpen ?? internal; const setOpen = (value: boolean) => { setInternal(value); onOpenChange?.(value); }; return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>; }
function DialogTrigger({ children }: { children: React.ReactNode }) { const context = React.useContext(DialogContext); return <span onClick={() => context?.setOpen(true)}>{children}</span>; }
function DialogContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) { const context = React.useContext(DialogContext); if (!context?.open) return null; return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) context.setOpen(false); }}><div role="dialog" aria-modal="true" className={cn("w-full max-w-lg rounded-xl border bg-surface p-6 shadow-xl", className)}>{children}<button type="button" aria-label="Close dialog" className="absolute" onClick={() => context.setOpen(false)} /></div></div>; }
function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />; }
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />; }
const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
const DialogDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
