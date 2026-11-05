export type RecurrenceDuration = "30d" | "1m" | "2m" | "3m" | "6m" | "12m";

export const weeklyRecurrenceDurations: Array<{ value: RecurrenceDuration; label: string }> = [
  { value: "30d", label: "30 days" },
  { value: "2m", label: "2 months" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

export const monthlyRecurrenceDurations: Array<{ value: RecurrenceDuration; label: string }> = [
  { value: "1m", label: "1 month" },
  { value: "2m", label: "2 months" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function deriveRecurrenceEndDate(startDate: string, duration: RecurrenceDuration) {
  const start = parseDate(startDate);
  if (duration === "30d") {
    start.setUTCDate(start.getUTCDate() + 29);
    return formatDate(start);
  }
  const months = Number(duration.slice(0, -1));
  const originalDay = start.getUTCDate();
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  target.setUTCDate(target.getUTCDate() - 1);
  return formatDate(target);
}

export function isRecurrenceDuration(value: unknown): value is RecurrenceDuration {
  return value === "30d" || value === "1m" || value === "2m" || value === "3m" || value === "6m" || value === "12m";
}
