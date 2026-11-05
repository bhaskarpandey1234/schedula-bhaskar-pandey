import { z } from "zod";
import { deriveRecurrenceEndDate, isRecurrenceDuration } from "@/lib/scheduling/recurrence";

const timezone = z.string().trim().refine((value) => { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; } }, "Use a valid IANA timezone.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
function isFutureLocal(value: string, time: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const current = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value}T${time}` > `${current.year}-${current.month}-${current.day}T${current.hour}:${current.minute}`;
}

export const availabilitySessionSchema = z.object({
  sessionType: z.enum(["recurring", "specific_date"]), recurrenceMethod: z.enum(["day", "date"]).optional(), schedulingType: z.enum(["wave", "stream"]),
  sessionDates: z.array(date).optional(), recurrenceStartDate: date.optional(), recurrenceDuration: z.string().optional(), monthlyDays: z.array(z.coerce.number().int().min(1).max(31)).optional(), consultingDays: z.array(z.coerce.number().int().min(1).max(7)).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone,
  intervalMinutes: z.coerce.number().int().refine((value) => [15, 30, 60].includes(value)).optional(), capacity: z.coerce.number().int().min(1).max(10),
}).superRefine((value, ctx) => {
  if (value.endTime <= value.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time." });
  if (value.schedulingType === "wave" && value.intervalMinutes == null) ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: "Choose an appointment duration for Wave scheduling." });
  if (value.schedulingType === "stream" && value.intervalMinutes != null) ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: "Stream scheduling uses the full time window." });
  if (value.sessionType === "recurring" && !value.recurrenceMethod) ctx.addIssue({ code: "custom", path: ["recurrenceMethod"], message: "Choose By Day (Weekly) or By Date (Monthly)." });
  if (value.sessionType === "recurring" && !value.recurrenceStartDate) ctx.addIssue({ code: "custom", path: ["recurrenceStartDate"], message: "Choose a recurrence start date." });
  if (value.sessionType === "recurring" && (!value.recurrenceDuration || !isRecurrenceDuration(value.recurrenceDuration) || (value.recurrenceMethod === "day" && value.recurrenceDuration === "1m") || (value.recurrenceMethod === "date" && value.recurrenceDuration === "30d"))) ctx.addIssue({ code: "custom", path: ["recurrenceDuration"], message: "Choose a valid repeat duration." });
  if (value.sessionType === "recurring" && value.recurrenceMethod === "day" && (!value.consultingDays?.length || value.monthlyDays?.length || value.sessionDates?.length)) ctx.addIssue({ code: "custom", path: ["consultingDays"], message: "Choose at least one weekday." });
  if (value.sessionType === "recurring" && value.recurrenceMethod === "date" && (!value.monthlyDays?.length || value.consultingDays?.length || value.sessionDates?.length)) ctx.addIssue({ code: "custom", path: ["monthlyDays"], message: "Choose at least one monthly day." });
  if (value.sessionType === "specific_date" && (!value.sessionDates?.length || value.recurrenceMethod || value.consultingDays?.length || value.recurrenceStartDate || value.recurrenceDuration || value.monthlyDays?.length)) ctx.addIssue({ code: "custom", path: ["sessionDates"], message: "Choose one or more specific future dates only." });
  if (value.sessionType === "recurring" && value.recurrenceStartDate && isRecurrenceDuration(value.recurrenceDuration)) {
    const recurrenceEndDate = deriveRecurrenceEndDate(value.recurrenceStartDate, value.recurrenceDuration);
    const days = Math.round((new Date(`${recurrenceEndDate}T00:00:00Z`).getTime() - new Date(`${value.recurrenceStartDate}T00:00:00Z`).getTime()) / 86400000);
    if (days < 0 || days > 366) ctx.addIssue({ code: "custom", path: ["recurrenceDuration"], message: "Recurrence must end within 12 months of its start date." });
    if (!isFutureLocal(value.recurrenceStartDate, value.startTime, value.timezone)) ctx.addIssue({ code: "custom", path: ["recurrenceStartDate"], message: "Availability must start in the future." });
  }
  if (value.sessionType === "specific_date" && value.sessionDates?.length) {
    const dates = [...new Set(value.sessionDates)].sort();
    if (dates.length !== value.sessionDates.length) ctx.addIssue({ code: "custom", path: ["sessionDates"], message: "Specific dates must be unique." });
    if (!dates.every((item) => isFutureLocal(item, value.startTime, value.timezone))) ctx.addIssue({ code: "custom", path: ["sessionDates"], message: "Specific dates must be in the future." });
    const span = Math.round((new Date(`${dates.at(-1)}T00:00:00Z`).getTime() - new Date(`${dates[0]}T00:00:00Z`).getTime()) / 86400000);
    if (span > 366) ctx.addIssue({ code: "custom", path: ["sessionDates"], message: "Specific dates must be within 12 months." });
  }
});
export type AvailabilitySessionInput = z.infer<typeof availabilitySessionSchema>;
