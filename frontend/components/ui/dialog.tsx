"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const DialogContext = React.createContext<{ open: boolean; setOpen: (value: boolean) => void } | null>(null);
function Dialog({ open: controlledOpen, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) { const [internal, setInternal] = React.useState(false); const open = controlledOpen ?? internal; const setOpen = (value: boolean) => { setInternal(value); onOpenChange?.(value); }; return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>; }
function DialogTrigger({ children }: { children: React.ReactElement<{ onClick?: React.MouseEventHandler }> }) { const context = React.useContext(DialogContext); return React.cloneElement(children, { onClick: (event: React.MouseEvent) => { children.props.onClick?.(event); if (!event.defaultPrevented) context?.setOpen(true); } }); }
function DialogContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DialogContext);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!context?.open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") context.setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [context]);

  if (!context?.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/35 p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) context.setOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative my-auto flex max-h-[calc(100svh-2rem)] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-2xl border border-border/80 bg-surface p-5 shadow-2xl sm:max-h-[calc(100svh-3rem)] sm:p-7",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => context.setOpen(false)}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}
function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("flex flex-col gap-2 pr-10 text-left", className)} {...props} />; }
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("mt-2 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end", className)} {...props} />; }
const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
const DialogDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
