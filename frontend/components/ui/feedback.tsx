"use client";

import { X } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Feedback = { id: number; type: "success" | "error" | "info" | "warning"; title: string; description?: string };
type FeedbackContextValue = { notify: (feedback: Omit<Feedback, "id">) => void };
const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Feedback[]>([]);
  const value = useMemo(() => ({ notify: (feedback: Omit<Feedback, "id">) => {
    const id = Date.now();
    setItems((current) => [...current, { ...feedback, id }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5000);
  }}), []);
  return <FeedbackContext.Provider value={value}>{children}<div aria-live="polite" className="fixed bottom-4 right-4 z-[100] grid w-[min(24rem,calc(100vw-2rem))] gap-2">{items.map((item) => <div key={item.id} role={item.type === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg transition-all ${item.type === "error" ? "border-destructive/40" : "border-primary/20"}`}><div className="min-w-0 flex-1"><p className="font-semibold">{item.title}</p>{item.description && <p className="mt-1 text-muted-foreground">{item.description}</p>}</div><Button size="icon" variant="ghost" className="size-7" aria-label="Dismiss notification" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><X aria-hidden="true" /></Button></div>)}</div></FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used inside FeedbackProvider");
  return context;
}
