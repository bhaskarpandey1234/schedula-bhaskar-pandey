"use client";

import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import type { AssistantRole } from "@/lib/assistant/types";

export function FloatingAssistant({ role }: { role: AssistantRole }) {
  const [open, setOpen] = useState(false);

  // Close assistant on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      {/* Subtle backdrop overlay with smooth GPU fade & blur */}
      <div
        className={`assistant-backdrop fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] ${
          open ? "is-open" : ""
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Right-Side Drawer (smooth hardware-accelerated slide with full height & rounded left side) */}
      <aside
        className={`assistant-drawer-panel fixed bottom-0 right-0 top-0 z-50 flex h-full w-full flex-col border-l border-t border-border/80 bg-background shadow-[-18px_0_50px_rgba(0,0,0,0.13)] sm:w-[460px] sm:max-w-[490px] rounded-t-3xl sm:rounded-tl-3xl sm:rounded-bl-3xl sm:rounded-tr-none sm:rounded-br-none sm:border-y sm:border-l overflow-hidden ${
          open ? "is-open pointer-events-auto" : "pointer-events-none"
        }`}
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label="Schedula assistant"
      >
        <AssistantChat role={role} compact onClose={() => setOpen(false)} />
      </aside>

      {/* Floating Action Button (smooth scale & spring transition on open/close) */}
      <div
        className={`assistant-fab-wrapper fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7 ${
          open ? "is-hidden" : ""
        }`}
      >
        <div className="group relative ml-auto w-fit">
          <button
            type="button"
            className="assistant-fab-button flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Open AI assistant"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Bot
              className="size-6 transition-transform duration-250 ease-out group-hover:scale-110 group-hover:rotate-[-8deg]"
              aria-hidden="true"
            />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-[calc(100%+0.85rem)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg border border-slate-700/60 opacity-0 translate-x-1.5 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 dark:bg-white dark:text-slate-900 dark:border-slate-200/80"
          >
            Ask Schedula AI
            <span
              className="absolute -right-1 top-1/2 -translate-y-1/2 size-2 rotate-45 bg-slate-900 border-r border-t border-slate-700/60 dark:bg-white dark:border-slate-200/80"
              aria-hidden="true"
            />
          </span>
        </div>
      </div>
    </>
  );
}
