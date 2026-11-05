import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function parse(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day)); }
function key(value: Date) { return value.toISOString().slice(0, 10); }
function monthLabel(value: Date) { return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(value); }

export function Calendar({ value, onChange, availableDates = [], minDate, className, name, required }: { value?: string; onChange?: (value: string) => void; availableDates?: string[]; minDate?: string; className?: string; name?: string; required?: boolean }) {
  const selected = value ? parse(value) : new Date();
  const [month, setMonth] = useState(() => new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1)));
  const firstDay = month.getUTCDay();
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const available = useMemo(() => new Set(availableDates), [availableDates]);
  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, index) => index - firstDay + 1);
  return <div className={cn("rounded-2xl border bg-background p-3", className)}><input type="date" className="sr-only" name={name} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} required={required} /><div className="mb-3 flex items-center justify-between"><Button type="button" variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))}><ChevronLeft /></Button><p className="text-sm font-semibold" aria-live="polite">{monthLabel(month)}</p><Button type="button" variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))}><ChevronRight /></Button></div><div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day} aria-hidden="true">{day}</span>)}{cells.map((day) => { const date = day < 1 || day > days ? null : new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)); const dateKey = date ? key(date) : ""; const disabled = !date || Boolean(minDate && dateKey < minDate) || Boolean(date && date < today); return <button key={`${month.toISOString()}-${day}`} type="button" aria-label={date ? dateKey : undefined} aria-pressed={dateKey === value} disabled={disabled} onClick={() => date && onChange?.(dateKey)} className={cn("aspect-square rounded-full text-xs transition-colors", disabled && "invisible", dateKey === value && "bg-primary text-primary-foreground", dateKey !== value && available.has(dateKey) && "bg-primary/10 font-semibold text-primary", dateKey !== value && !available.has(dateKey) && "hover:bg-accent")}>{date?.getUTCDate()}</button>; })}</div></div>;
}
