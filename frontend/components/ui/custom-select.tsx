"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
const emptyValue = "__schedula_empty_value__";

export function CustomSelect({ name, id, defaultValue = "", value: controlledValue, options, required, className, onValueChange, error, describedBy }: {
  name: string; id?: string; defaultValue?: string; value?: string; options: Option[]; required?: boolean; className?: string; onValueChange?: (value: string) => void; error?: boolean; describedBy?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const updateValue = (next: string) => { setInternalValue(next); onValueChange?.(next); };

  return <><input type="hidden" name={name} value={value} required={required} /><Select.Root value={value || emptyValue} onValueChange={(next) => updateValue(next === emptyValue ? "" : next)}>
    <Select.Trigger id={triggerId} aria-invalid={error || undefined} aria-describedby={describedBy} className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-[border-color,box-shadow] hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive", className)}>
      <Select.Value placeholder="Select an option" />
      <Select.Icon><ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"><Select.Viewport>{options.map((option) => <Select.Item key={option.value || "empty"} value={option.value || emptyValue} className="relative flex cursor-default select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"><Select.ItemIndicator className="absolute left-2 inline-flex"><Check className="size-4 text-primary" aria-hidden="true" /></Select.ItemIndicator><Select.ItemText>{option.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
  </Select.Root></>;
}
