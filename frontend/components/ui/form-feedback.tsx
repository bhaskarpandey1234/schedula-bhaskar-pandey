import { CircleAlert } from "lucide-react";

export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return <p id={id} role="alert" className="flex items-start gap-1.5 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{children}</p>;
}

export function FormErrorSummary({ error }: { error?: string }) {
  if (!error) return null;
  return <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>;
}
