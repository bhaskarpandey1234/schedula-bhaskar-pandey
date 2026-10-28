"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export function CustomSelect({ name, id, defaultValue = "", value: controlledValue, options, required, className, onValueChange, error, describedBy }: {
  name: string; id?: string; defaultValue?: string; value?: string; options: Option[]; required?: boolean; className?: string; onValueChange?: (value: string) => void; error?: boolean; describedBy?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const setValue = (next: string) => { setInternalValue(next); onValueChange?.(next); };
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        id={triggerId}
        type="button"
        className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-[border-color,box-shadow] hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive", className)}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${triggerId}-options`}
        aria-required={required || undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{selected?.label ?? "Select an option"}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && <div id={`${triggerId}-options`} role="listbox" aria-labelledby={triggerId} className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
        {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={value === option.value} className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onMouseDown={(event) => event.preventDefault()} onClick={() => { setValue(option.value); setOpen(false); }}>
          {option.label}{value === option.value && <Check className="size-4 text-primary" aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  );
}
