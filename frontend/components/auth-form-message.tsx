"use client";

import { useEffect } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";

export function AuthFormMessage({ error, success }: { error?: string; success?: string }) {
  const { notify } = useFeedback();
  useEffect(() => {
    const message = error ?? success;
    if (message) notify({ type: error ? "error" : "success", title: error ? "Check the form" : "Success", description: message });
  }, [error, success, notify]);
  if (!error && !success) return null;
  return <p role={error ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"}`}>{error ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}<span>{error ?? success}</span></p>;
}
