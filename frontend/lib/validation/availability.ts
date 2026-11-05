import { z } from "zod";

const timezone = z.string().trim().refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}, "Use a valid IANA timezone.");

function isFutureLocal(date: string, time: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const current = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${date}T${time}` > `${current.year}-${current.month}-${current.day}T${current.hour}:${current.minute}`;
}

export const availabilitySessionSchema = z.object({
  mode: z.enum(["weekly", "monthly", "custom"]).default("custom"),
  schedulingType: z.enum(["wave", "stream"]).default("wave"),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").optional(),
  recurrenceStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date.").optional(),
  recurrenceEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date.").optional(),
  monthlyRangeEndDay: z.coerce.number().int().min(1).max(31).optional(),
  consultingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one consulting day.").optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time."),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time."),
  timezone,
  intervalMinutes: z.coerce.number().int().refine((value) => [15, 30, 60].includes(value), "Choose a 15, 30, or 60 minute interval.").optional(),
  capacity: z.coerce.number().int().min(1).max(10),
}).superRefine((value, ctx) => {
  if (value.endTime <= value.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time." });
  if (value.schedulingType === "wave" && value.intervalMinutes == null) ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: "Choose an appointment duration for Wave scheduling." });
  if (value.schedulingType === "stream" && value.intervalMinutes != null) ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: "Stream scheduling uses the full time window." });
  if (value.mode === "weekly" && (!value.consultingDays?.length || value.sessionDate || !value.recurrenceStartDate || !value.recurrenceEndDate || value.monthlyRangeEndDay != null)) {
    ctx.addIssue({ code: "custom", path: ["consultingDays"], message: "Choose at least one consulting day." });
  }
  if (value.mode === "monthly" && (!value.recurrenceStartDate || !value.recurrenceEndDate || value.consultingDays?.length || value.sessionDate || value.monthlyRangeEndDay == null)) {
    ctx.addIssue({ code: "custom", path: ["recurrenceStartDate"], message: "Choose a monthly date range and end date." });
  }
  if (value.mode === "custom" && (!value.sessionDate || value.consultingDays?.length || value.recurrenceStartDate || value.recurrenceEndDate || value.monthlyRangeEndDay != null)) {
    ctx.addIssue({ code: "custom", path: ["sessionDate"], message: "Choose a custom session date." });
  }
  const startDate = value.mode === "custom" ? value.sessionDate : value.recurrenceStartDate;
  if (startDate && !isFutureLocal(startDate, value.startTime, value.timezone)) {
    ctx.addIssue({ code: "custom", path: ["sessionDate"], message: "Availability must start in the future." });
  }
  if (value.mode !== "custom" && value.recurrenceStartDate && value.recurrenceEndDate) {
    const start = new Date(`${value.recurrenceStartDate}T00:00:00Z`);
    const end = new Date(`${value.recurrenceEndDate}T00:00:00Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (days < 0 || days > 366) ctx.addIssue({ code: "custom", path: ["recurrenceEndDate"], message: "Recurrence must end within 12 months of its start date." });
    if (value.mode === "monthly" && value.monthlyRangeEndDay != null && value.monthlyRangeEndDay < Number(value.recurrenceStartDate.slice(8, 10))) {
      ctx.addIssue({ code: "custom", path: ["monthlyRangeEndDay"], message: "Monthly range end day must be on or after the first date day." });
    }
  }
});

export type AvailabilitySessionInput = z.infer<typeof availabilitySessionSchema>;
