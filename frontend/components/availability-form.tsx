"use client";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAvailabilityAction, type AvailabilityActionState } from "@/lib/availability/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";
import { Checkbox } from "@/components/ui/checkbox";
import { deriveRecurrenceEndDate, monthlyRecurrenceDurations, weeklyRecurrenceDurations, type RecurrenceDuration } from "@/lib/scheduling/recurrence";

const weekdays = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]] as const;
type Mode = "weekly" | "monthly" | "custom"; type SessionType = "recurring" | "specific_date"; type RecurrenceMethod = "day" | "date";
function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Generating slots…" : "Create availability"}</Button>; }

export function AvailabilityForm({ timezone, defaultDate, initialMode = "weekly" }: { timezone: string; defaultDate: string; initialMode?: Mode }) {
  const [state, action] = useActionState(createAvailabilityAction, {} as AvailabilityActionState);
  const [sessionType, setSessionType] = useState<SessionType>(initialMode === "custom" ? "specific_date" : "recurring");
  const [recurrenceMethod, setRecurrenceMethod] = useState<RecurrenceMethod>(initialMode === "monthly" ? "date" : "day");
  const [recurrenceDuration, setRecurrenceDuration] = useState<RecurrenceDuration>(initialMode === "monthly" ? "2m" : "30d");
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(defaultDate);
  const [schedulingType, setSchedulingType] = useState<"wave" | "stream">("wave");
  const [specificDates, setSpecificDates] = useState([defaultDate]);
  const submitted = state.values ?? {};
  useEffect(() => {
    if (submitted.sessionType === "recurring" || submitted.sessionType === "specific_date") setSessionType(submitted.sessionType);
    if (submitted.recurrenceMethod === "day" || submitted.recurrenceMethod === "date") setRecurrenceMethod(submitted.recurrenceMethod);
    if (["30d", "1m", "2m", "3m", "6m", "12m"].includes(submitted.recurrenceDuration ?? "")) setRecurrenceDuration(submitted.recurrenceDuration as RecurrenceDuration);
    if (submitted.recurrenceStartDate) setRecurrenceStartDate(submitted.recurrenceStartDate);
    if (submitted.schedulingType === "wave" || submitted.schedulingType === "stream") setSchedulingType(submitted.schedulingType);
    if (submitted.sessionDates) setSpecificDates(submitted.sessionDates.split(",").filter(Boolean));
  }, [submitted.sessionType, submitted.recurrenceMethod, submitted.schedulingType, submitted.sessionDates, submitted.recurrenceDuration, submitted.recurrenceStartDate]);
  const selectedDays = submitted.consultingDays?.split(",").filter(Boolean) ?? null;
  const selectedMonthlyDays = submitted.monthlyDays?.split(",").filter(Boolean) ?? null;
  const byDay = sessionType === "recurring" && recurrenceMethod === "day";
  const byDate = sessionType === "recurring" && recurrenceMethod === "date";
  return <Card><CardHeader><CardTitle>Create availability</CardTitle><CardDescription>Choose Wave or Stream, then create a recurring or one-time schedule. Recurrences can span up to 12 months.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid min-w-0 gap-4">
    <input type="hidden" name="timezone" value={submitted.timezone ?? timezone} />
    <div className="grid min-w-0 gap-2"><Label htmlFor="scheduling-type">Scheduling type</Label><CustomSelect id="scheduling-type" name="schedulingType" value={schedulingType} onValueChange={(v) => setSchedulingType(v as "wave" | "stream")} options={[{ value: "wave", label: "Wave" }, { value: "stream", label: "Stream" }]} required /><p className="text-xs text-muted-foreground">Wave creates duration-based appointment slots. Stream creates one shared arrival window.</p></div>
    <div className="grid min-w-0 gap-2"><Label htmlFor="session-type">Scheduling frequency</Label><CustomSelect id="session-type" name="sessionType" value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)} options={[{ value: "recurring", label: "Recurring" }, { value: "specific_date", label: "Non-recurring" }]} required /></div>
    {sessionType === "recurring" && <div className="grid min-w-0 gap-2"><Label htmlFor="recurrence-method">Recurring pattern (required)</Label><CustomSelect id="recurrence-method" name="recurrenceMethod" value={recurrenceMethod} onValueChange={(v) => { const method = v as RecurrenceMethod; setRecurrenceMethod(method); setRecurrenceDuration(method === "day" ? "30d" : "2m"); }} options={[{ value: "day", label: "By Day (Weekly)" }, { value: "date", label: "By Date (Monthly)" }]} required /><FieldError id="availability-recurrence-method-error">{state.fieldErrors?.recurrenceMethod}</FieldError></div>}
    {sessionType === "recurring" && <div className="grid min-w-0 gap-2"><Label htmlFor="recurrenceStartDate">Starts on (required)</Label><Input id="recurrenceStartDate" name="recurrenceStartDate" type="date" value={recurrenceStartDate} onChange={(event) => setRecurrenceStartDate(event.target.value)} required /><FieldError id="availability-start-date-error">{state.fieldErrors?.recurrenceStartDate}</FieldError></div>}
    {byDay && <fieldset className="grid min-w-0 gap-2"><legend className="text-sm font-medium">Consulting weekdays (required)</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{weekdays.map(([value, label]) => <label key={value} className="flex min-w-0 items-center gap-2 text-sm"><Checkbox name="consultingDays" value={value} defaultChecked={selectedDays ? selectedDays.includes(String(value)) : value <= 5} />{label}</label>)}</div><FieldError id="availability-days-error">{state.fieldErrors?.consultingDays}</FieldError></fieldset>}
    {byDate && <fieldset className="grid min-w-0 gap-2"><legend className="text-sm font-medium">Monthly days (required)</legend><div className="grid grid-cols-7 gap-2">{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <label key={day} className="flex items-center gap-1 text-sm"><Checkbox name="monthlyDays" value={day} defaultChecked={selectedMonthlyDays ? selectedMonthlyDays.includes(String(day)) : false} />{day}</label>)}</div><p className="text-xs text-muted-foreground">Dates that do not exist in shorter months, such as February 30, are skipped.</p><FieldError id="availability-monthly-days-error">{state.fieldErrors?.monthlyDays}</FieldError></fieldset>}
    {sessionType === "recurring" && <div className="grid min-w-0 gap-2"><Label htmlFor="recurrenceDuration">Repeat for (required)</Label><CustomSelect id="recurrenceDuration" name="recurrenceDuration" value={recurrenceDuration} onValueChange={(v) => setRecurrenceDuration(v as RecurrenceDuration)} options={(byDay ? weeklyRecurrenceDurations : monthlyRecurrenceDurations)} required /><p className="text-xs text-muted-foreground">Repeats through {deriveRecurrenceEndDate(recurrenceStartDate, recurrenceDuration)}.</p><FieldError id="availability-duration-error">{state.fieldErrors?.recurrenceDuration}</FieldError></div>}
    {sessionType === "specific_date" && <fieldset className="grid min-w-0 gap-2"><legend className="text-sm font-medium">Specific Dates (One-time)</legend>{specificDates.map((date, index) => <div key={`${index}-${date}`} className="flex min-w-0 gap-2"><Input className="min-w-0 flex-1" name="sessionDates" type="date" value={date} onChange={(e) => setSpecificDates((items) => items.map((item, i) => i === index ? e.target.value : item))} required />{specificDates.length > 1 && <Button type="button" variant="outline" onClick={() => setSpecificDates((items) => items.filter((_, i) => i !== index))}>Remove</Button>}</div>)}<Button type="button" variant="outline" onClick={() => setSpecificDates((items) => [...items, defaultDate])}>Add date</Button><FieldError id="availability-specific-dates-error">{state.fieldErrors?.sessionDates}</FieldError></fieldset>}
    <div className="grid min-w-0 gap-2 md:grid-cols-2"><div className="grid min-w-0 gap-2"><Label htmlFor="startTime">Start time</Label><Input id="startTime" name="startTime" type="time" defaultValue={submitted.startTime} required /></div><div className="grid min-w-0 gap-2"><Label htmlFor="endTime">End time</Label><Input id="endTime" name="endTime" type="time" defaultValue={submitted.endTime} required /></div></div><p className="text-sm text-muted-foreground">Timezone: {timezone}</p>
    <div className="grid min-w-0 gap-2 md:grid-cols-2"><div className="grid min-w-0 gap-2">{schedulingType === "wave" ? <><Label htmlFor="intervalMinutes">Appointment duration</Label><CustomSelect id="intervalMinutes" name="intervalMinutes" defaultValue={submitted.intervalMinutes ?? "30"} options={[{ value: "15", label: "15 minutes" }, { value: "30", label: "30 minutes" }, { value: "60", label: "60 minutes" }]} required /><FieldError id="availability-interval-error">{state.fieldErrors?.intervalMinutes}</FieldError></> : <><Label>Appointment duration</Label><p className="rounded-md border border-dashed p-2 text-sm text-muted-foreground">Stream uses the full window</p></>}</div><div className="grid min-w-0 gap-2"><Label htmlFor="capacity">{schedulingType === "wave" ? "Patients per slot" : "Patients per arrival window"}</Label><Input id="capacity" name="capacity" type="number" min="1" max="10" defaultValue={submitted.capacity ?? "3"} required /><FieldError id="availability-capacity-error">{state.fieldErrors?.capacity}</FieldError></div></div>
    <FormErrorSummary error={state.error} /><SubmitButton />
  </form></CardContent></Card>;
}
