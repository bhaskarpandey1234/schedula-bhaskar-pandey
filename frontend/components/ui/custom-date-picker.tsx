"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

function formatDateLabel(isoDate: string, placeholder = "Select date"): string {
  if (!isoDate) return placeholder;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function CustomDatePicker({
  id,
  name,
  value: controlledValue,
  defaultValue = "",
  onChange,
  required,
  minDate,
  todayDate,
  availableDates,
  allowPastDates,
  placeholder = "Select date",
  className,
}: {
  id?: string;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  minDate?: string;
  todayDate?: string;
  availableDates?: string[];
  allowPastDates?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || controlledValue || "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  const handleSelectDate = (nextDate: string) => {
    setInternalValue(nextDate);
    onChange?.(nextDate);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="hidden"
        name={name}
        id={id}
        value={value}
        required={required}
      />
      <button
        type="button"
        id={id ? `${id}-trigger` : undefined}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Select date, currently ${formatDateLabel(value, placeholder)}`}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-[border-color,box-shadow] hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn(!value && "text-muted-foreground")}>
            {formatDateLabel(value, placeholder)}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Calendar date picker"
          className="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-2xl border bg-popover p-2 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <Calendar
            value={value}
            onChange={handleSelectDate}
            availableDates={availableDates}
            minDate={minDate}
            todayDate={todayDate}
            allowPastDates={allowPastDates}
          />
        </div>
      )}
    </div>
  );
}
