"use client";

import { MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import type { AssistantRole } from "@/lib/assistant/types";

export function FloatingAssistant({ role }: { role: AssistantRole }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7">
      {open && <div className="assistant-popup absolute bottom-16 right-0 w-[calc(100vw-2rem)] max-w-3xl origin-bottom-right sm:w-[44rem]" role="dialog" aria-modal="true" aria-label="Schedula assistant"><AssistantChat role={role} compact /></div>}
      <div className="group relative ml-auto w-fit">
        <button type="button" className={`flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:-translate-y-1 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${open ? "rotate-90" : "animate-[assistant-pulse_2.4s_ease-in-out_infinite]"}`} aria-label={open ? "Close AI assistant" : "Open AI assistant"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X className="size-6" aria-hidden="true" /> : <MessageCircle className="size-6" aria-hidden="true" />}
        </button>
        <span role="tooltip" className="pointer-events-none absolute bottom-1/2 right-[calc(100%+0.75rem)] translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{open ? "Close assistant" : "Ask Schedula AI"}</span>
      </div>
    </div>
  );
}
