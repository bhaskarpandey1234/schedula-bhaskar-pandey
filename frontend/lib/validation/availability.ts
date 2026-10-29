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
  mode: z.enum(["weekly", "custom"]).default("custom"),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").optional(),
  consultingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time."),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time."),
  timezone,
  intervalMinutes: z.coerce.number().int().refine((value) => [15, 30, 60].includes(value), "Choose a 15, 30, or 60 minute interval."),
  capacity: z.coerce.number().int().min(1).max(10),
}).superRefine((value, ctx) => {
  if (value.endTime <= value.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time." });
  if (value.mode === "weekly" && (!value.consultingDays?.length || value.sessionDate)) {
    ctx.addIssue({ code: "custom", path: ["consultingDays"], message: "Choose at least one consulting day." });
  }
  if (value.mode === "custom" && (!value.sessionDate || value.consultingDays?.length)) {
    ctx.addIssue({ code: "custom", path: ["sessionDate"], message: "Choose a custom session date." });
  }
  if (value.sessionDate && !isFutureLocal(value.sessionDate, value.startTime, value.timezone)) {
    ctx.addIssue({ code: "custom", path: ["sessionDate"], message: "Availability must start in the future." });
  }
});

export type AvailabilitySessionInput = z.infer<typeof availabilitySessionSchema>;
