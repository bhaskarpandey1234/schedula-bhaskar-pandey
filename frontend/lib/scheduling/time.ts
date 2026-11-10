export function localDateKey(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function formatLocalTime(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatLocalDate(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
  }).format(new Date(value));
}

/** Formats an already timezone-normalized YYYY-MM-DD key without reinterpreting it in the browser timezone. */
export function formatDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    dateStyle: "full",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatLocalSlotRange(start: string | Date, end: string | Date, timezone: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startLabel = formatLocalTime(startDate, timezone);
  const endLabel = formatLocalTime(endDate, timezone);
  const startDay = localDateKey(startDate, timezone);
  const endDay = localDateKey(endDate, timezone);
  if (startDay === endDay) return `${startLabel} – ${endLabel}`;
  const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" });
  return `${dateFormatter.format(startDate)} ${startLabel} – ${dateFormatter.format(endDate)} ${endLabel}`;
}

export function formatSchedulingWindow(start: string | Date, end: string | Date, timezone: string, schedulingType?: "wave" | "stream") {
  const range = formatLocalSlotRange(start, end, timezone);
  return schedulingType === "stream" ? `Arrive ${range}` : range;
}
